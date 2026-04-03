import { useState, useCallback, useMemo, useRef } from 'react';
import { createAgent } from '../agent/index.js';
import type { Mode } from '../utils/permissions.js';
import { getAllowedToolNames } from '../utils/permissions.js';
import type { AgentToolName } from '../tools/index.js';
import { createAgentUIStream, isToolUIPart, readUIMessageStream, type UIMessage } from 'ai';

type ToolPart = Extract<UIMessage['parts'][number], { toolCallId: string }>;

type QuestionOption = {
	id: string;
	label: string;
	description?: string;
};

type AskUserQuestionInput = {
	question: string;
	options: QuestionOption[];
	allowMultiple?: boolean;
};

export type PendingInteraction =
	| {
		kind: 'approval';
		messageId: string;
		toolCallId: string;
		toolName: string;
		approvalId: string;
		question: string;
		detail?: string;
		targetMode?: Mode;
	}
	| {
		kind: 'question';
		messageId: string;
		toolCallId: string;
		toolName: 'askUserQuestion';
		question: string;
		options: QuestionOption[];
		allowMultiple: boolean;
	};

let msgCounter = 0;
function generateId() {
	return `msg-${Date.now()}-${++msgCounter}`;
}

function normalizeMessages(nextMessages: UIMessage[], previousMessages: UIMessage[]): UIMessage[] {
	const seenIds = new Set<string>();

	return nextMessages.map((message, index) => {
		const candidateId = message.id.trim();
		const previousMessage = previousMessages[index];
		const previousId = previousMessage?.id?.trim();

		let normalizedId = candidateId;

		if (!normalizedId || seenIds.has(normalizedId)) {
			if (previousMessage?.role === message.role && previousId && !seenIds.has(previousId)) {
				normalizedId = previousId;
			} else {
				normalizedId = generateId();
			}
		}

		seenIds.add(normalizedId);

		if (normalizedId === message.id) {
			return message;
		}

		return {
			...message,
			id: normalizedId,
		};
	});
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === 'string') {
		return error;
	}

	try {
		const result = JSON.stringify(error);
		if (result !== undefined) {
			return result;
		}
	} catch {
		// fall through to fallback
	}
	return String(error);
}

function createUserMessage(text: string): UIMessage {
	return {
		id: generateId(),
		role: 'user',
		parts: [{ type: 'text', text }],
	};
}

function getToolName(part: ToolPart): string {
	return part.type === 'dynamic-tool' ? part.toolName : part.type.slice(5);
}

function mergeAssistantMessage(baseMessages: UIMessage[], assistantMessage: UIMessage): UIMessage[] {
	const lastMessage = baseMessages.at(-1);
	if (lastMessage?.role === 'assistant') {
		return [...baseMessages.slice(0, -1), assistantMessage];
	}

	return [...baseMessages, assistantMessage];
}

function updateToolPartInMessages(options: {
	messages: UIMessage[];
	messageId: string;
	toolCallId: string;
	updater: (toolPart: ToolPart) => ToolPart;
}): UIMessage[] {
	const { messages, messageId, toolCallId, updater } = options;

	return messages.map((message) => {
		if (message.id !== messageId) {
			return message;
		}

		return {
			...message,
			parts: message.parts.map((part) => {
				if (!isToolUIPart(part) || part.toolCallId !== toolCallId) {
					return part;
				}

				return updater(part as ToolPart);
			}),
		};
	});
}

function extractPendingInteraction(messages: UIMessage[]): PendingInteraction | null {
	for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
		const message = messages[messageIndex];
		if (message?.role !== 'assistant') {
			continue;
		}

		for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
			const part = message.parts[partIndex];
			if (part == null || !isToolUIPart(part)) {
				continue;
			}

			const toolName = getToolName(part as ToolPart);

			if (part.state === 'approval-requested') {
				const input = (part.input ?? {}) as Record<string, unknown>;
				const targetMode = input['targetMode'] === 'yolo' ? 'yolo' : 'code';
				const detail = typeof input['planSummary'] === 'string' ? input['planSummary'] : undefined;

				return {
					kind: 'approval',
					messageId: message.id,
					toolCallId: part.toolCallId,
					toolName,
					approvalId: part.approval.id,
					question:
						toolName === 'exitPlanMode'
							? `Leave plan mode and switch to ${targetMode.toUpperCase()} mode?`
							: `Approve ${toolName}?`,
					detail,
					targetMode,
				};
			}

			if (part.state === 'input-available' && toolName === 'askUserQuestion') {
				const input = part.input as AskUserQuestionInput;
				return {
					kind: 'question',
					messageId: message.id,
					toolCallId: part.toolCallId,
					toolName: 'askUserQuestion',
					question: input.question,
					options: input.options ?? [],
					allowMultiple: input.allowMultiple === true,
				};
			}
		}
	}

	return null;
}

export function useAgent(mode: Mode) {
	const [messages, setMessages] = useState<UIMessage[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const agentRef = useRef(createAgent());
	const messagesRef = useRef<UIMessage[]>([]);

	const setConversation = useCallback((nextMessages: UIMessage[]) => {
		const normalizedMessages = normalizeMessages(nextMessages, messagesRef.current);
		messagesRef.current = normalizedMessages;
		setMessages(normalizedMessages);
	}, []);

	const runAgent = useCallback(async (baseMessages: UIMessage[], runMode: Mode) => {
		setError(null);
		setIsLoading(true);

		const activeTools = [...getAllowedToolNames(runMode)] as AgentToolName[];

		try {
			const stream = await createAgentUIStream({
				agent: agentRef.current,
				uiMessages: baseMessages,
				options: {
					activeTools,
					mode: runMode,
				},
			});

			let finalMessages = baseMessages;

			for await (const assistantMessage of readUIMessageStream({
				stream,
				onError: streamError => {
					setError(getErrorMessage(streamError));
				},
				terminateOnError: true,
			})) {
				finalMessages = mergeAssistantMessage(baseMessages, assistantMessage);
				setConversation(finalMessages);
			}

			setConversation(finalMessages);
		} catch (err: unknown) {
			setError(getErrorMessage(err));
		} finally {
			setIsLoading(false);
		}
	}, [setConversation]);

	const sendMessage = useCallback(async (text: string) => {
		const userMessage = createUserMessage(text);
		const baseMessages = [...messagesRef.current, userMessage];
		setConversation(baseMessages);
		await runAgent(baseMessages, mode);
	}, [mode, runAgent, setConversation]);

	const submitToolApproval = useCallback(async (options: {
		messageId: string;
		toolCallId: string;
		approvalId: string;
		approved: boolean;
		reason?: string;
		overrideMode?: Mode;
	}) => {
		const nextMessages = updateToolPartInMessages({
			messages: messagesRef.current,
			messageId: options.messageId,
			toolCallId: options.toolCallId,
			updater: (part) => {
				const {
					output: _output,
					errorText: _errorText,
					resultProviderMetadata: _resultProviderMetadata,
					preliminary: _preliminary,
					...basePart
				} = part as ToolPart & Record<string, unknown>;

				return {
					...basePart,
					state: 'approval-responded',
					approval: {
						id: options.approvalId,
						approved: options.approved,
						...(options.reason ? {reason: options.reason} : {}),
					},
				} as ToolPart;
			},
		});

		setConversation(nextMessages);
		await runAgent(nextMessages, options.overrideMode ?? mode);
	}, [mode, runAgent, setConversation]);

	const submitToolOutput = useCallback(async <TOutput,>(options: {
		messageId: string;
		toolCallId: string;
		output: TOutput;
		overrideMode?: Mode;
	}) => {
		const nextMessages = updateToolPartInMessages({
			messages: messagesRef.current,
			messageId: options.messageId,
			toolCallId: options.toolCallId,
			updater: (part) => {
				const {
					errorText: _errorText,
					approval: _approval,
					resultProviderMetadata: _resultProviderMetadata,
					preliminary: _preliminary,
					...basePart
				} = part as ToolPart & Record<string, unknown>;

				return {
					...basePart,
					state: 'output-available',
					output: options.output,
				} as ToolPart;
			},
		});

		setConversation(nextMessages);
		await runAgent(nextMessages, options.overrideMode ?? mode);
	}, [mode, runAgent, setConversation]);

	const pendingInteraction = useMemo(() => extractPendingInteraction(messages), [messages]);

	return {
		messages,
		isLoading,
		error,
		sendMessage,
		pendingInteraction,
		submitToolApproval,
		submitToolOutput,
	};
}
