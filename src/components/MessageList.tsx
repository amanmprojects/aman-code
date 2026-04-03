import React, { memo } from 'react';
import { Box } from 'ink';
import AssistantMessage from './AssistantMessage.js';
import UserMessage from './UserMessage.js';
import type { UIMessage } from 'ai';

interface MessageListProps {
	messages: UIMessage[];
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
function MessageList({ messages }: MessageListProps) {
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

// Memoize to prevent re-renders when parent state changes but messages haven't
export default memo(MessageList, (prevProps, nextProps) => {
	// Re-render if message count changes
	if (prevProps.messages.length !== nextProps.messages.length) {
		return false;
	}

	// Check if last message changed (most common update pattern)
	const lastPrev = prevProps.messages[prevProps.messages.length - 1];
	const lastNext = nextProps.messages[nextProps.messages.length - 1];

	// If IDs differ, re-render
	if (lastPrev?.id !== lastNext?.id) {
		return false;
	}

	// Also check for in-place content updates (streaming, tool-part updates)
	// Compare parts for assistant messages (which have tool parts)
	if (lastPrev?.role === 'assistant' && lastNext?.role === 'assistant') {
		const prevParts = lastPrev.parts;
		const nextParts = lastNext.parts;
		if (prevParts?.length !== nextParts?.length) {
			return false;
		}
		// Compare all corresponding parts for content changes
		if (prevParts && nextParts) {
			for (let i = 0; i < prevParts.length; i++) {
				const prevPart = prevParts[i];
				const nextPart = nextParts[i];
				// Compare type
				if (prevPart?.type !== nextPart?.type) {
					return false;
				}
				// For tool parts, compare state
				if (prevPart?.type?.startsWith('tool-') && nextPart?.type?.startsWith('tool-')) {
					const prevToolPart = prevPart as { state?: string };
					const nextToolPart = nextPart as { state?: string };
					if (prevToolPart?.state !== nextToolPart?.state) {
						return false;
					}
				}
				// For text parts, compare text content (handles streaming)
				if (prevPart?.type === 'text' && nextPart?.type === 'text') {
					const prevTextPart = prevPart as { text?: string };
					const nextTextPart = nextPart as { text?: string };
					if (prevTextPart?.text !== nextTextPart?.text) {
						return false;
					}
				}
			}
		}
	}

	// Compare parts for user messages too (user messages store content in parts)
	if (lastPrev?.role === 'user' && lastNext?.role === 'user') {
		const prevParts = lastPrev.parts;
		const nextParts = lastNext.parts;
		if (prevParts?.length !== nextParts?.length) {
			return false;
		}
		// Compare all parts for content changes
		if (prevParts && nextParts) {
			for (let i = 0; i < prevParts.length; i++) {
				const prevPart = prevParts[i];
				const nextPart = nextParts[i];
				if (prevPart?.type !== nextPart?.type) {
					return false;
				}
				// For text parts, compare text content
				if (prevPart?.type === 'text' && nextPart?.type === 'text') {
					const prevTextPart = prevPart as { text?: string };
					const nextTextPart = nextPart as { text?: string };
					if (prevTextPart?.text !== nextTextPart?.text) {
						return false;
					}
				}
			}
		}
	}

	// All checks passed, skip re-render
	return true;
});
