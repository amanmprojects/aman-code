import React from 'react';
import { Box, Text } from 'ink';
import AssistantMessage from './AssistantMessage.js';
import type { ChatMessage } from '../hooks/useAgent.js';

interface MessageListProps {
	messages: ChatMessage[];
}

export default function MessageList({ messages }: MessageListProps) {
	return (
		<Box flexDirection="column">
			{messages.map((msg, i) => {
				if (msg.role === 'user') {
					return (
						<Box key={i} marginBottom={1}>
							<Text color="green" bold>
								{'❯ '}
							</Text>
							<Text>{msg.content}</Text>
						</Box>
					);
				}

				return <AssistantMessage key={i} message={msg} />;
			})}
		</Box>
	);
}
