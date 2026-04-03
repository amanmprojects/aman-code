import { useState, useCallback, useRef } from 'react';
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
	const conversationRef = useRef<Array<{ role: string; content: string }>>([]);

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
			const toolCalls = new Map<string, DynamicToolUIPart>();

			const updateAssistant = () => {
				const parts: UIMessage['parts'] = [];
				if (currentText) {
					parts.push({ type: 'text', text: currentText });
				}

				for (const tc of toolCalls.values()) {
					parts.push(tc);
				}

				setMessages(prev => {
					const updated = [...prev];
					const last = updated[updated.length - 1];
					if (last && last.role === 'assistant') {
						updated[updated.length - 1] = {
							...last,
							parts,
						};
					}

					return updated;
				});
			};

			for await (const part of result.fullStream) {
				switch (part.type) {
					case 'text-delta': {
						currentText += part.text;
						updateAssistant();
						break;
					}

					case 'tool-input-start': {
						toolCalls.set(part.id, {
							type: 'dynamic-tool',
							toolCallId: part.id,
							toolName: part.toolName,
							state: 'input-streaming',
							input: undefined,
						});
						updateAssistant();
						break;
					}

					case 'tool-call': {
						const existing = toolCalls.get(part.toolCallId);
						if (existing) {
							toolCalls.set(part.toolCallId, {
								...existing,
								state: 'input-available',
								input: part.input,
							} as DynamicToolUIPart);
						}

						updateAssistant();
						break;
					}

					case 'tool-result': {
						const tc = toolCalls.get(part.toolCallId);
						if (tc) {
							toolCalls.set(part.toolCallId, {
								...tc,
								state: 'output-available',
								output: part.output,
							} as DynamicToolUIPart);
						}

						updateAssistant();
						break;
					}

					case 'tool-error': {
						const tc2 = toolCalls.get(part.toolCallId);
						if (tc2) {
							toolCalls.set(part.toolCallId, {
								...tc2,
								state: 'output-error',
								input: tc2.input,
								errorText: String(part.error ?? 'Tool execution failed'),
							} as DynamicToolUIPart);
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
