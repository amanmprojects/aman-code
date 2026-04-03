import {useState, useCallback, useMemo, useRef} from 'react';
import {createAgent} from '../agent/index.js';
import type {Mode} from '../utils/permissions.js';
import {getAllowedToolNames} from '../utils/permissions.js';
import type {AgentToolName} from '../tools/index.js';
import {
	createAgentUIStream,
	isToolUIPart,
	readUIMessageStream,
	type UIMessage,
} from 'ai';
import {formatUiPerfDuration, logUiPerf} from '../utils/uiPerf.js';
import {getErrorMessage, classifyError} from '../utils/errorClassification.js';

type ToolPart = Extract<UIMessage['parts'][number], {toolCallId: string}>;

type QuestionOption = {
	id: string;
	label: string;
	description?: string;
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

function normalizeMessages(
	nextMessages: UIMessage[],
	previousMessages: UIMessage[],
): UIMessage[] {
	const seenIds = new Set<string>();

	return nextMessages.map((message, index) => {
		const candidateId = message.id.trim();
		const previousMessage = previousMessages[index];
		const previousId = previousMessage?.id?.trim();

		let normalizedId = candidateId;

		if (!normalizedId || seenIds.has(normalizedId)) {
			if (
				previousMessage?.role === message.role &&
				previousId &&
				!seenIds.has(previousId)
			) {
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

function createUserMessage(text: string): UIMessage {
	return {
		id: generateId(),
		role: 'user',
		parts: [{type: 'text', text}],
	};
}

function getToolName(part: ToolPart): string {
	return part.type === 'dynamic-tool' ? part.toolName : part.type.slice(5);
}

function mergeAssistantMessage(
	baseMessages: UIMessage[],
	assistantMessage: UIMessage,
): UIMessage[] {
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
	const {messages, messageId, toolCallId, updater} = options;

	return messages.map(message => {
		if (message.id !== messageId) {
			return message;
		}

		return {
			...message,
			parts: message.parts.map(part => {
				if (!isToolUIPart(part) || part.toolCallId !== toolCallId) {
					return part;
				}

				return updater(part as ToolPart);
			}),
		};
	});
}

function extractPendingInteraction(
	messages: UIMessage[],
): PendingInteraction | null {
	for (
		let messageIndex = messages.length - 1;
		messageIndex >= 0;
		messageIndex -= 1
	) {
		const message = messages[messageIndex];
		if (message?.role !== 'assistant') {
			continue;
		}

		for (
			let partIndex = message.parts.length - 1;
			partIndex >= 0;
			partIndex -= 1
		) {
			const part = message.parts[partIndex];
			if (part == null || !isToolUIPart(part)) {
				continue;
			}

			const toolName = getToolName(part as ToolPart);

			if (part.state === 'approval-requested') {
				const input = (part.input ?? {}) as Record<string, unknown>;
				const detail =
					typeof input['planSummary'] === 'string'
						? input['planSummary']
						: undefined;

				if (toolName === 'exitPlanMode') {
					const targetMode = input['targetMode'] === 'yolo' ? 'yolo' : 'code';
					return {
						kind: 'approval',
						messageId: message.id,
						toolCallId: part.toolCallId,
						toolName,
						approvalId: part.approval.id,
						question: `Leave plan mode and switch to ${targetMode.toUpperCase()} mode?`,
						detail,
						targetMode,
					};
				}

				return {
					kind: 'approval',
					messageId: message.id,
					toolCallId: part.toolCallId,
					toolName,
					approvalId: part.approval.id,
					question: `Approve ${toolName}?`,
					detail,
				};
			}

			if (part.state === 'input-available' && toolName === 'askUserQuestion') {
				const rawInput = part.input;
				if (
					rawInput == null ||
					typeof rawInput !== 'object' ||
					Array.isArray(rawInput)
				) {
					console.warn(
						'Skipping invalid askUserQuestion input: expected object',
					);
					continue;
				}

				const input = rawInput as Record<string, unknown>;
				if (
					typeof input['question'] !== 'string' ||
					input['question'].trim().length === 0
				) {
					console.warn(
						'Skipping invalid askUserQuestion input: missing question',
					);
					continue;
				}

				if (
					input['options'] !== undefined &&
					!Array.isArray(input['options'])
				) {
					console.warn(
						'Skipping invalid askUserQuestion input: options must be an array',
					);
					continue;
				}

				const options = Array.isArray(input['options'])
					? input['options']
							.map((option): QuestionOption | null => {
								if (
									option == null ||
									typeof option !== 'object' ||
									Array.isArray(option)
								) {
									return null;
								}

								const candidate = option as Record<string, unknown>;
								if (
									typeof candidate['id'] !== 'string' ||
									typeof candidate['label'] !== 'string'
								) {
									return null;
								}

								return {
									id: candidate['id'],
									label: candidate['label'],
									...(typeof candidate['description'] === 'string'
										? {description: candidate['description']}
										: {}),
								};
							})
							.filter((option): option is QuestionOption => option != null)
					: [];

				if (
					Array.isArray(input['options']) &&
					options.length !== input['options'].length
				) {
					console.warn(
						'Skipping invalid askUserQuestion input: malformed option items',
					);
					continue;
				}

				return {
					kind: 'question',
					messageId: message.id,
					toolCallId: part.toolCallId,
					toolName: 'askUserQuestion',
					question: input['question'],
					options,
					allowMultiple: input['allowMultiple'] === true,
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
	const agentRunIdRef = useRef(0);
	const agentAbortRef = useRef<AbortController | null>(null);

	const setConversation = useCallback((nextMessages: UIMessage[]) => {
		const normalizedMessages = normalizeMessages(
			nextMessages,
			messagesRef.current,
		);
		messagesRef.current = normalizedMessages;
		setMessages(normalizedMessages);
	}, []);

	const runAgent = useCallback(
		async (baseMessages: UIMessage[], runMode: Mode) => {
			agentAbortRef.current?.abort();
			const runAbortController = new AbortController();
			agentAbortRef.current = runAbortController;
			const runId = agentRunIdRef.current + 1;
			agentRunIdRef.current = runId;

			const isCurrentRun = () =>
				agentRunIdRef.current === runId &&
				agentAbortRef.current === runAbortController &&
				!runAbortController.signal.aborted;

			setError(null);
			setIsLoading(true);

			const activeTools = [...getAllowedToolNames(runMode)] as AgentToolName[];
			const runStartedAt = performance.now();
			let lastStreamUpdateAt = runStartedAt;
			let streamUpdateCount = 0;
			let retryCount = 0;
			const MAX_RETRIES = 1;

			logUiPerf('agent_run_started', {
				baseMessages: baseMessages.length,
				mode: runMode,
				toolCount: activeTools.length,
			});

			try {
				let finalMessages = baseMessages;
				let lastError: unknown = null;

				while (retryCount <= MAX_RETRIES) {
					if (!isCurrentRun()) {
						return;
					}

					try {
						const stream = await createAgentUIStream({
							agent: agentRef.current,
							uiMessages: finalMessages,
							options: {
								activeTools,
								mode: runMode,
							},
						});

						let streamSucceeded = true;

						for await (const assistantMessage of readUIMessageStream({
							stream,
							onError: streamError => {
								lastError = streamError;
								streamSucceeded = false;
								if (retryCount >= MAX_RETRIES && isCurrentRun()) {
									setError(getErrorMessage(streamError));
								}
							},
							terminateOnError: true,
						})) {
							if (!isCurrentRun()) {
								return;
							}

							const updateStartedAt = performance.now();
							finalMessages = mergeAssistantMessage(
								finalMessages,
								assistantMessage,
							);
							setConversation(finalMessages);

							streamUpdateCount += 1;
							const now = performance.now();
							const sinceLastUpdate = now - lastStreamUpdateAt;
							lastStreamUpdateAt = now;

							if (streamUpdateCount === 1 || streamUpdateCount % 10 === 0) {
								logUiPerf('agent_stream_update', {
									messages: finalMessages.length,
									sinceLastUpdateMs: formatUiPerfDuration(sinceLastUpdate),
									streamUpdateCount,
									updateDispatchMs: formatUiPerfDuration(now - updateStartedAt),
									retryCount,
								});
							}
						}

						if (streamSucceeded) {
							break;
						}
					} catch (err: unknown) {
						lastError = err;
					}

					retryCount += 1;

					if (retryCount <= MAX_RETRIES) {
						const errorClassification = classifyError(lastError);

						if (errorClassification === 'malformed-tool-args') {
							logUiPerf('malformed_tool_args_detected', {
								retryAttempt: retryCount,
								errorMessage: getErrorMessage(lastError),
							});

							const recoveryMessage = createUserMessage(
								`Previous tool call failed with malformed JSON arguments. Error: ${getErrorMessage(
									lastError,
								)}. Regenerate the tool call with strict JSON - no trailing commas, fully quoted keys and string values, no comments. Match the schema exactly.`,
							);
							finalMessages = [...finalMessages, recoveryMessage];
						} else {
							if (retryCount >= MAX_RETRIES && isCurrentRun()) {
								setError(getErrorMessage(lastError));
							}
							break;
						}
					}
				}

				if (retryCount > MAX_RETRIES && lastError && isCurrentRun()) {
					setError(getErrorMessage(lastError));
				}

				if (!isCurrentRun()) {
					return;
				}

				setConversation(finalMessages);
			} catch (err: unknown) {
				if (isCurrentRun()) {
					setError(getErrorMessage(err));
				}
			} finally {
				logUiPerf('agent_run_finished', {
					durationMs: formatUiPerfDuration(performance.now() - runStartedAt),
					streamUpdateCount,
					retryCount,
				});

				if (agentAbortRef.current === runAbortController) {
					agentAbortRef.current = null;
					if (agentRunIdRef.current === runId) {
						setIsLoading(false);
					}
				}
			}
		},
		[setConversation],
	);

	const sendMessage = useCallback(
		async (text: string) => {
			const userMessage = createUserMessage(text);
			const baseMessages = [...messagesRef.current, userMessage];
			setConversation(baseMessages);
			await runAgent(baseMessages, mode);
		},
		[mode, runAgent, setConversation],
	);

	const submitToolApproval = useCallback(
		async (options: {
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
				updater: part => {
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
		},
		[mode, runAgent, setConversation],
	);

	const submitToolOutput = useCallback(
		async <TOutput>(options: {
			messageId: string;
			toolCallId: string;
			output: TOutput;
			overrideMode?: Mode;
		}) => {
			const nextMessages = updateToolPartInMessages({
				messages: messagesRef.current,
				messageId: options.messageId,
				toolCallId: options.toolCallId,
				updater: part => {
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
		},
		[mode, runAgent, setConversation],
	);

	const pendingInteraction = useMemo(
		() => extractPendingInteraction(messages),
		[messages],
	);

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
