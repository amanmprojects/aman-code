import React from 'react';
import { Box, Text } from 'ink';
import AssistantMessage from './AssistantMessage.js';
import type { ChatMessage } from '../hooks/useAgent.js';
import Divider from 'ink-divider';

interface MessageListProps {
	messages: ChatMessage[];
}

export default function MessageList({ messages }: MessageListProps) {
	return (
		<Box flexDirection="column">
			{messages.map((msg, i) => {
				if (msg.role === 'user') {
					return (
						<Box key={i} marginBottom={1} flexDirection='column'>
							<Divider />
							<Box >
								<Text color="green" bold>
									{'❯ '}
								</Text>
								<Text>{msg.content}</Text>
							</Box>
							<Divider />
						</Box>
					);
				}

				return <AssistantMessage key={i} message={msg} />;
			})}
		</Box>
	);
}
