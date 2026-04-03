import { useState, useCallback, useRef, useEffect } from 'react';
import { createAgent } from '../agent/index.js';
import type { Mode } from '../utils/permissions.js';
import { createAgentUIStream, readUIMessageStream, type UIMessage } from 'ai';

let msgCounter = 0;
function generateId() {
	return `msg-${Date.now()}-${++msgCounter}`;
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

export function useAgent(mode: Mode) {
	const [messages, setMessages] = useState<UIMessage[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const agentRef = useRef(createAgent(mode));
	const agentModeRef = useRef<Mode>(mode);
	const messagesRef = useRef<UIMessage[]>([]);

	const ensureAgentMode = useCallback(() => {
		if (agentModeRef.current === mode) {
			return;
		}

		agentRef.current = createAgent(mode);
		agentModeRef.current = mode;
	}, [mode]);

	useEffect(() => {
		if (isLoading) {
			return;
		}

		ensureAgentMode();
	}, [isLoading, ensureAgentMode]);

	const setConversation = useCallback((nextMessages: UIMessage[]) => {
		messagesRef.current = nextMessages;
		setMessages(nextMessages);
	}, []);

	const sendMessage = useCallback(async (text: string) => {
		setError(null);
		setIsLoading(true);

		const userMessage = createUserMessage(text);
		const baseMessages = [...messagesRef.current, userMessage];
		setConversation(baseMessages);

		try {
			ensureAgentMode();

			const stream = await createAgentUIStream({
				agent: agentRef.current,
				uiMessages: baseMessages,
			});

			let finalMessages = baseMessages;

			for await (const assistantMessage of readUIMessageStream({
				stream,
				onError: streamError => {
					setError(getErrorMessage(streamError));
				},
				terminateOnError: true,
			})) {
				finalMessages = [...baseMessages, assistantMessage];
				setConversation(finalMessages);
			}

			setConversation(finalMessages);
		} catch (err: unknown) {
			setError(getErrorMessage(err));
		} finally {
			setIsLoading(false);
		}
	}, [ensureAgentMode, setConversation]);

	return { messages, isLoading, error, sendMessage };
}
