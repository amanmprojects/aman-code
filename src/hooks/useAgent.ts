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
/**
 * Generate a unique identifier for a message.
 *
 * @returns A string message id suitable for use as a unique message identifier (e.g. "msg-<timestamp>-<counter>").
 */
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

/**
 * Create a user-role UIMessage containing a single text part.
 *
 * @param text - The message text to include in the created message
 * @returns A `UIMessage` with `role: 'user'`, a generated `id`, and one text part containing `text`
 */
function createUserMessage(text: string): UIMessage {
	return {
		id: generateId(),
		role: 'user',
		parts: [{ type: 'text', text }],
	};
}

/**
 * Derives the tool's canonical name from a tool UI part.
 *
 * @param part - A tool UI part (contains type and, for dynamic tools, a `toolName`)
 * @returns The tool name extracted from the part
 */
function getToolName(part: ToolPart): string {
	return part.type === 'dynamic-tool' ? part.toolName : part.type.slice(5);
}

/**
 * Appends an assistant message to a conversation, replacing the final message if that final message is already from the assistant.
 *
 * @param baseMessages - The existing conversation messages in order.
 * @param assistantMessage - The assistant message to append or use as a replacement.
 * @returns The new message array where `assistantMessage` replaces the last message if it has `role === 'assistant'`, otherwise `assistantMessage` is appended. 
 */
function mergeAssistantMessage(baseMessages: UIMessage[], assistantMessage: UIMessage): UIMessage[] {
	const lastMessage = baseMessages.at(-1);
	if (lastMessage?.role === 'assistant') {
		return [...baseMessages.slice(0, -1), assistantMessage];
	}

	return [...baseMessages, assistantMessage];
}

/**
 * Update a specific tool UI part inside the provided messages by applying `updater` to the matching part.
 *
 * @param messages - The conversation messages to search and update
 * @param messageId - The id of the message that contains the tool part to update
 * @param toolCallId - The tool call id that identifies which tool UI part to update within the message
 * @param updater - A function that receives the matched `ToolPart` and returns the updated `ToolPart`
 * @returns A new array of `UIMessage` where the targeted tool part has been replaced by the updater's result; all other messages and parts are preserved
 */
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

/**
 * Find the most recent unresolved user-facing interaction emitted in assistant tool UI parts.
 *
 * Scans `messages` from newest to oldest and returns the latest pending interaction produced by an assistant
 * tool UI part: either an approval request (kind `'approval'`) or a user question emitted by the
 * `askUserQuestion` tool (kind `'question'`). Returns `null` when no pending interaction is found.
 *
 * @param messages - Conversation messages to scan (newest messages may be at the end of the array)
 * @returns A `PendingInteraction` describing the latest unresolved approval or question, or `null` if none exists.
 */
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

/**
 * React hook that manages an interactive, streaming agent conversation and handles tool-driven user interactions.
 *
 * @param mode - Agent execution mode used when advancing the conversation (affects allowed tools and agent behavior)
 * @returns An object with the agent conversation state and control callbacks:
 *  - `messages`: current normalized `UIMessage[]` conversation
 *  - `isLoading`: `true` while the agent is running
 *  - `error`: error message string or `null`
 *  - `sendMessage(text)`: append a user message and run the agent
 *  - `pendingInteraction`: the most recent unresolved tool interaction (`PendingInteraction | null`)
 *  - `submitToolApproval(options)`: submit an approval response for a tool UI part and rerun the agent
 *  - `submitToolOutput(options)`: submit tool output for a tool UI part and rerun the agent
 */
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
