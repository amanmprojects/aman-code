import React from 'react';
import { Box } from 'ink';
import AssistantMessage from './AssistantMessage.js';
import UserMessage from './UserMessage.js';
import type { UIMessage } from 'ai';
// import Divider from 'ink-divider';

interface MessageListProps {
	messages: UIMessage[];
}

export default function MessageList({ messages }: MessageListProps) {
	return (
		<Box flexDirection="column">
			{messages.map((msg) => {
				if (msg.role === 'user') {
					return <UserMessage key={msg.id} msg={msg} />;
				}

				return <AssistantMessage key={msg.id} message={msg} />;
			})}
		</Box>
	);
}
