import {useState, useCallback, useRef, useEffect} from 'react';
import {
	createAgentUIStream,
	isToolUIPart,
	readUIMessageStream,
	type ToolExecutionOptions,
	type UIMessage,
} from 'ai';
import {createAgent} from '../agent/index.js';
import type {Mode} from '../utils/permissions.js';
import {getAllowedToolNames} from '../utils/permissions.js';
import {allTools, type AgentToolName} from '../tools/index.js';
import {formatUiPerfDuration, logUiPerf} from '../utils/ui-perf.js';
import {getErrorMessage, classifyError} from '../utils/error-classification.js';
import {
	createTranscriptStore,
	type TranscriptStore,
} from '../state/transcript-store.js';
import {
	saveSession,
	deriveTitle,
	generateSessionId,
	type Session,
} from '../state/sessionStore.js';

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

let messageCounter = 0;
/**
 * Generate a unique identifier for a message.
 *
 * @returns A string message id suitable for use as a unique message identifier (e.g. "msg-<timestamp>-<counter>").
 */
function generateId() {
	return `msg-${Date.now()}-${++messageCounter}`;
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
		parts: [{type: 'text', text}],
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
function extractPendingInteraction(
	messages: UIMessage[],
): PendingInteraction | undefined {
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
			if (part === undefined || part === null || !isToolUIPart(part)) {
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
					rawInput === undefined ||
					rawInput === null ||
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
							.map((option): QuestionOption | undefined => {
								if (
									option === undefined ||
									option === null ||
									typeof option !== 'object' ||
									Array.isArray(option)
								) {
									return undefined;
								}

								const candidate = option as Record<string, unknown>;
								if (
									typeof candidate['id'] !== 'string' ||
									typeof candidate['label'] !== 'string'
								) {
									return undefined;
								}

								return {
									id: candidate['id'],
									label: candidate['label'],
									...(typeof candidate['description'] === 'string'
										? {description: candidate['description']}
										: {}),
								};
							})
							.filter(
								(option): option is QuestionOption =>
									option !== undefined && option !== null,
							)
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

	return undefined;
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
type UseAgentOptions = {
	initialMessages?: UIMessage[];
	sessionId?: string;
};

export function useAgent(mode: Mode, options?: UseAgentOptions) {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | undefined>(undefined);
	const [pendingInteraction, setPendingInteraction] = useState<
		PendingInteraction | undefined
	>(undefined);
	const agentRef = useRef(createAgent());
	const transcriptStoreRef = useRef<TranscriptStore>(createTranscriptStore());
	const messagesRef = useRef<UIMessage[]>(options?.initialMessages ?? []);
	const agentRunIdRef = useRef(0);
	const agentAbortRef = useRef<AbortController | undefined>(undefined);
	const sessionIdRef = useRef(options?.sessionId ?? generateSessionId());
	const sessionCreatedAtRef = useRef(new Date().toISOString());
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const modeRef = useRef(mode);

	// Hydrate transcript store with initial messages on mount
	useEffect(() => {
		if (options?.initialMessages && options.initialMessages.length > 0) {
			transcriptStoreRef.current.setMessages(options.initialMessages);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		modeRef.current = mode;
	}, [mode]);

	useEffect(
		() => () => {
			if (saveTimerRef.current) {
				clearTimeout(saveTimerRef.current);
				saveTimerRef.current = undefined;
			}
		},
		[],
	);

	const scheduleSave = useCallback((messages: UIMessage[]) => {
		if (saveTimerRef.current) {
			clearTimeout(saveTimerRef.current);
		}

		saveTimerRef.current = setTimeout(() => {
			saveTimerRef.current = undefined;
			if (messages.length === 0) {
				return;
			}

			const session: Session = {
				id: sessionIdRef.current,
				title: deriveTitle(messages),
				createdAt: sessionCreatedAtRef.current,
				updatedAt: new Date().toISOString(),
				mode: modeRef.current,
				cwd: process.cwd(),
				messages,
			};

			void saveSession(session).catch((error: unknown) => {
				console.error('Failed to save session', {
					error,
					sessionId: session.id,
					messageCount: session.messages.length,
				});
			});
		}, 2000);
	}, []);

	const setConversation = useCallback(
		(nextMessages: UIMessage[]) => {
			const normalizedMessages = normalizeMessages(
				nextMessages,
				messagesRef.current,
			);
			messagesRef.current = normalizedMessages;
			transcriptStoreRef.current.setMessages(normalizedMessages);
			scheduleSave(normalizedMessages);
			const nextPendingInteraction =
				extractPendingInteraction(normalizedMessages);
			setPendingInteraction(previousInteraction => {
				if (
					(previousInteraction === undefined || previousInteraction === null) &&
					(nextPendingInteraction === undefined ||
						nextPendingInteraction === null)
				) {
					return previousInteraction;
				}

				if (
					previousInteraction !== undefined &&
					previousInteraction !== null &&
					nextPendingInteraction !== undefined &&
					nextPendingInteraction !== null &&
					JSON.stringify(previousInteraction) ===
						JSON.stringify(nextPendingInteraction)
				) {
					return previousInteraction;
				}

				return nextPendingInteraction;
			});
		},
		[scheduleSave],
	);

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

			setError(undefined);
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
				let lastError: unknown;

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
							onError(streamError) {
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
					} catch (error_: unknown) {
						lastError = error_;
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
			} catch (error_: unknown) {
				if (isCurrentRun()) {
					setError(getErrorMessage(error_));
				}
			} finally {
				logUiPerf('agent_run_finished', {
					durationMs: formatUiPerfDuration(performance.now() - runStartedAt),
					streamUpdateCount,
					retryCount,
				});

				if (agentAbortRef.current === runAbortController) {
					agentAbortRef.current = undefined;
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
			// Get the current tool part to extract input and tool name
			const message = messagesRef.current.find(m => m.id === options.messageId);
			const toolPart = message?.parts.find(
				(part): part is ToolPart =>
					isToolUIPart(part) && part.toolCallId === options.toolCallId,
			);

			if (!toolPart) {
				throw new Error(`Tool part not found: ${options.toolCallId}`);
			}

			const toolName = getToolName(toolPart);
			const tool = allTools[toolName as AgentToolName];
			const input = (toolPart.input ?? {}) as Record<string, unknown>;

			let nextMessages: UIMessage[];

			if (
				options.approved &&
				tool.execute !== undefined &&
				tool.execute !== null
			) {
				// Execute the tool and transition to output-available
				try {
					const toolExecutionOptions: ToolExecutionOptions = {
						toolCallId: options.toolCallId,
						messages: [],
						abortSignal: undefined,
						experimental_context: {mode: options.overrideMode ?? mode},
					};
					const output: unknown = await tool.execute(
						input,
						toolExecutionOptions,
					);

					nextMessages = updateToolPartInMessages({
						messages: messagesRef.current,
						messageId: options.messageId,
						toolCallId: options.toolCallId,
						updater(part) {
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
								output,
							} as ToolPart;
						},
					});
				} catch (error) {
					// If execution fails, transition to output-error
					nextMessages = updateToolPartInMessages({
						messages: messagesRef.current,
						messageId: options.messageId,
						toolCallId: options.toolCallId,
						updater(part) {
							const {
								output: _output,
								approval: _approval,
								resultProviderMetadata: _resultProviderMetadata,
								preliminary: _preliminary,
								...basePart
							} = part as ToolPart & Record<string, unknown>;

							return {
								...basePart,
								state: 'output-error',
								errorText: getErrorMessage(error),
							} as ToolPart;
						},
					});
				}
			} else if (options.approved) {
				// Approved but no execute function - transition to output-error
				// This shouldn't happen for tools with needsApproval, but handle gracefully
				nextMessages = updateToolPartInMessages({
					messages: messagesRef.current,
					messageId: options.messageId,
					toolCallId: options.toolCallId,
					updater(part) {
						const {
							output: _output,
							approval: _approval,
							resultProviderMetadata: _resultProviderMetadata,
							preliminary: _preliminary,
							...basePart
						} = part as ToolPart & Record<string, unknown>;

						return {
							...basePart,
							state: 'output-error',
							errorText: options.reason ?? 'Tool execution not available',
							approval: {
								id: options.approvalId,
								approved: true,
								reason: options.reason ?? 'Tool execution not available',
							},
						} as ToolPart;
					},
				});
			} else {
				// Denied - transition to output-denied
				nextMessages = updateToolPartInMessages({
					messages: messagesRef.current,
					messageId: options.messageId,
					toolCallId: options.toolCallId,
					updater(part) {
						const {
							output: _output,
							approval: _approval,
							resultProviderMetadata: _resultProviderMetadata,
							preliminary: _preliminary,
							...basePart
						} = part as ToolPart & Record<string, unknown>;

						return {
							...basePart,
							state: 'output-denied',
							approval: {
								id: options.approvalId,
								approved: false,
								reason: options.reason ?? 'User denied approval',
							},
						} as ToolPart;
					},
				});
			}

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
				updater(part) {
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

	return {
		sessionId: sessionIdRef.current,
		transcriptStore: transcriptStoreRef.current,
		isLoading,
		error,
		sendMessage,
		pendingInteraction,
		submitToolApproval,
		submitToolOutput,
	};
}
