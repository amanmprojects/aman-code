import { useState, useCallback, useEffect, useRef } from 'react';
import { createAgent } from '../agent/index.js';
import type { Mode } from '../utils/permissions.js';

export interface ToolCallInfo {
	id: string;
	toolName: string;
	args: Record<string, any>;
	status: 'running' | 'done' | 'error';
	result?: any;
	error?: string;
}

export interface MessagePart {
	type: 'text' | 'tool-call';
	text?: string;
	toolCall?: ToolCallInfo;
}

export interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
	parts: MessagePart[];
}

export function useAgent(mode: Mode) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
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

		const userMessage: ChatMessage = {
			role: 'user',
			content: text,
			parts: [{ type: 'text', text }],
		};

		setMessages(prev => [...prev, userMessage]);

		conversationRef.current.push({ role: 'user', content: text });

		const assistantMessage: ChatMessage = {
			role: 'assistant',
			content: '',
			parts: [],
		};

		setMessages(prev => [...prev, assistantMessage]);

		try {
			const result = await agentRef.current.stream({
				messages: conversationRef.current as any,
			});

			let currentText = '';
			const toolCalls = new Map<string, ToolCallInfo>();

			const updateAssistant = () => {
				const parts: MessagePart[] = [];
				if (currentText) {
					parts.push({ type: 'text', text: currentText });
				}

				for (const tc of toolCalls.values()) {
					parts.push({ type: 'tool-call', toolCall: tc });
				}

				setMessages(prev => {
					const updated = [...prev];
					const last = updated[updated.length - 1];
					if (last && last.role === 'assistant') {
						updated[updated.length - 1] = {
							...last,
							content: currentText,
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
							id: part.id,
							toolName: part.toolName,
							args: {},
							status: 'running',
						});
						updateAssistant();
						break;
					}

					case 'tool-call': {
						const existing = toolCalls.get((part as any).toolCallId);
						if (existing) {
							existing.args = (part as any).input as Record<string, any>;
						}

						updateAssistant();
						break;
					}

					case 'tool-result': {
						const tc = toolCalls.get((part as any).toolCallId);
						if (tc) {
							tc.status = 'done';
							tc.result = (part as any).output;
						}

						updateAssistant();
						break;
					}

					case 'tool-error': {
						const tc2 = toolCalls.get((part as any).toolCallId);
						if (tc2) {
							tc2.status = 'error';
							tc2.error = String((part as any).error ?? 'Tool execution failed');
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
