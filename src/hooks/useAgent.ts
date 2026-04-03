import { useState, useCallback, useEffect, useRef } from 'react';
import { createAgent } from '../agent/index.js';
import type { Mode } from '../utils/permissions.js';
import type { UIMessage, DynamicToolUIPart } from 'ai';

let msgCounter = 0;
function generateId() {
	return `msg-${Date.now()}-${++msgCounter}`;
}

export function useAgent(mode: Mode) {
	const [messages, setMessages] = useState<UIMessage[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const agentRef = useRef(createAgent(mode));
	const agentModeRef = useRef<Mode>(mode);
	const conversationRef = useRef<Array<{ role: string; content: string }>>([]);

	useEffect(() => {
		if (isLoading || agentModeRef.current === mode) {
			return;
		}

		agentRef.current = createAgent(mode);
		agentModeRef.current = mode;
	}, [mode, isLoading]);

	const sendMessage = useCallback(async (text: string) => {
		setError(null);
		setIsLoading(true);

		const userMessage: UIMessage = {
			id: generateId(),
			role: 'user',
			parts: [{ type: 'text', text }],
		};

		setMessages(prev => [...prev, userMessage]);

		conversationRef.current.push({ role: 'user', content: text });

		const assistantMessage: UIMessage = {
			id: generateId(),
			role: 'assistant',
			parts: [],
		};

		setMessages(prev => [...prev, assistantMessage]);

		try {
			const result = await agentRef.current.stream({
				messages: conversationRef.current as any,
			});

			let currentText = '';
			const orderedParts: UIMessage['parts'] = [];
			const toolCallIndex = new Map<string, number>();

			const updateAssistant = () => {
				setMessages(prev => {
					const updated = [...prev];
					const last = updated[updated.length - 1];
					if (last && last.role === 'assistant') {
						updated[updated.length - 1] = {
							...last,
							parts: [...orderedParts],
						};
					}

					return updated;
				});
			};

			const updateToolPart = (toolCallId: string, patch: Partial<DynamicToolUIPart>) => {
				const idx = toolCallIndex.get(toolCallId);
				if (idx !== undefined) {
					orderedParts[idx] = { ...(orderedParts[idx] as DynamicToolUIPart), ...patch } as DynamicToolUIPart;
				}
			};

			for await (const part of result.fullStream) {
				switch (part.type) {
					case 'text-delta': {
						currentText += part.text;
						const lastPart = orderedParts[orderedParts.length - 1];
						if (lastPart && lastPart.type === 'text') {
							orderedParts[orderedParts.length - 1] = { type: 'text', text: currentText };
						} else {
							orderedParts.push({ type: 'text', text: currentText });
						}
						updateAssistant();
						break;
					}

					case 'tool-input-start': {
						const toolPart: DynamicToolUIPart = {
							type: 'dynamic-tool',
							toolCallId: part.id,
							toolName: part.toolName,
							state: 'input-streaming',
							input: undefined,
						};
						toolCallIndex.set(part.id, orderedParts.length);
						orderedParts.push(toolPart);
						currentText = '';
						updateAssistant();
						break;
					}

					case 'tool-call': {
						updateToolPart(part.toolCallId, {
							state: 'input-available',
							input: part.input,
						});
						updateAssistant();
						break;
					}

					case 'tool-result': {
						updateToolPart(part.toolCallId, {
							state: 'output-available',
							output: part.output,
						});
						updateAssistant();
						break;
					}

					case 'tool-error': {
						const idx = toolCallIndex.get(part.toolCallId);
						if (idx !== undefined) {
							const tc = orderedParts[idx] as DynamicToolUIPart;
							orderedParts[idx] = {
								...tc,
								state: 'output-error',
								input: tc.input,
								errorText: String(part.error ?? 'Tool execution failed'),
							} as DynamicToolUIPart;
						}
						updateAssistant();
						break;
					}

					case 'error': {
						setError(String(part.error));
						break;
					}

					default:
						break;
				}
			}

			conversationRef.current.push({
				role: 'assistant',
				content: currentText,
			});
		} catch (err: any) {
			setError(err.message ?? 'Unknown error');
		} finally {
			setIsLoading(false);
		}
	}, []);

	return { messages, isLoading, error, sendMessage };
}
