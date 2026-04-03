import React, {memo} from 'react';
import {Box} from 'ink';
import type {UIMessage} from 'ai';
import AssistantMessage from './AssistantMessage.js';
import UserMessage from './UserMessage.js';

interface MessageListProps {
	messages: UIMessage[];
}

function equalPart(
	prevPart: UIMessage['parts'][number],
	nextPart: UIMessage['parts'][number],
): boolean {
	if (prevPart?.type !== nextPart?.type) {
		return false;
	}

	if (prevPart?.type === 'text' && nextPart?.type === 'text') {
		return prevPart.text === nextPart.text;
	}

	if (
		prevPart?.type?.startsWith('tool-') &&
		nextPart?.type?.startsWith('tool-')
	) {
		const prevToolPart = prevPart as Record<string, unknown>;
		const nextToolPart = nextPart as Record<string, unknown>;
		return (
			prevToolPart['state'] === nextToolPart['state'] &&
			prevToolPart['toolCallId'] === nextToolPart['toolCallId'] &&
			prevToolPart['toolName'] === nextToolPart['toolName'] &&
			JSON.stringify(prevToolPart['input']) ===
				JSON.stringify(nextToolPart['input']) &&
			JSON.stringify(prevToolPart['args']) ===
				JSON.stringify(nextToolPart['args']) &&
			JSON.stringify(prevToolPart['result']) ===
				JSON.stringify(nextToolPart['result']) &&
			JSON.stringify(prevToolPart['output']) ===
				JSON.stringify(nextToolPart['output']) &&
			JSON.stringify(prevToolPart['approval']) ===
				JSON.stringify(nextToolPart['approval']) &&
			prevToolPart['errorText'] === nextToolPart['errorText']
		);
	}

	return JSON.stringify(prevPart) === JSON.stringify(nextPart);
}

function equalMessage(prevMessage: UIMessage, nextMessage: UIMessage): boolean {
	if (
		prevMessage.id !== nextMessage.id ||
		prevMessage.role !== nextMessage.role
	) {
		return false;
	}

	if (prevMessage.parts.length !== nextMessage.parts.length) {
		return false;
	}

	for (let index = 0; index < prevMessage.parts.length; index += 1) {
		const prevPart = prevMessage.parts[index]!;
		const nextPart = nextMessage.parts[index]!;
		if (!equalPart(prevPart, nextPart)) {
			return false;
		}
	}

	return true;
}

function equalMessages(
	prevMessages: UIMessage[],
	nextMessages: UIMessage[],
): boolean {
	if (prevMessages.length !== nextMessages.length) {
		return false;
	}

	for (let index = 0; index < prevMessages.length; index += 1) {
		const prevMessage = prevMessages[index]!;
		const nextMessage = nextMessages[index]!;
		if (!equalMessage(prevMessage, nextMessage)) {
			return false;
		}
	}

	return true;
}

/**
 * Renders a vertical list of chat messages.
 *
 * Each message is rendered as a UserMessage when `role === 'user'` and as an
 * AssistantMessage for other roles. The React key for each message is
 * `msg.id.trim()` if non-empty, otherwise `${msg.role}-${index}`.
 *
 * @param messages - The array of messages to render
 * @returns A JSX element containing the messages arranged vertically
 */
function MessageList({messages}: MessageListProps) {
	return (
		<Box flexDirection="column">
			{messages.map((msg, index) => {
				const messageKey = msg.id.trim() || `${msg.role}-${index}`;

				if (msg.role === 'user') {
					return <UserMessage key={messageKey} msg={msg} />;
				}

				return <AssistantMessage key={messageKey} message={msg} />;
			})}
		</Box>
	);
}

export default memo(MessageList, (prevProps, nextProps) =>
	equalMessages(prevProps.messages, nextProps.messages),
);
