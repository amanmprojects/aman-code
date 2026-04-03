import { useState, useCallback, useRef } from 'react';
import { createAgent } from '../agent/index.js';
import type { Mode } from '../utils/permissions.js';
import { getAllowedToolNames } from '../utils/permissions.js';
import type { AgentToolName } from '../tools/index.js';
import { createAgentUIStream, readUIMessageStream, type UIMessage } from 'ai';

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

	const sendMessage = useCallback(async (text: string) => {
		setError(null);
		setIsLoading(true);

		const activeTools = [...getAllowedToolNames(mode)] as AgentToolName[];

		const userMessage = createUserMessage(text);
		const baseMessages = [...messagesRef.current, userMessage];
		setConversation(baseMessages);

		try {
			const stream = await createAgentUIStream({
				agent: agentRef.current,
				uiMessages: baseMessages,
				options: {
					activeTools,
					mode,
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
				finalMessages = [...baseMessages, assistantMessage];
				setConversation(finalMessages);
			}

			setConversation(finalMessages);
		} catch (err: unknown) {
			setError(getErrorMessage(err));
		} finally {
			setIsLoading(false);
		}
	}, [mode, setConversation]);

	return { messages, isLoading, error, sendMessage };
}
