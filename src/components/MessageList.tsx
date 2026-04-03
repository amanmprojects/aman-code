import React from 'react';
import { Box, Text } from 'ink';
import AssistantMessage from './AssistantMessage.js';
import type { UIMessage } from 'ai';
// import Divider from 'ink-divider';

interface MessageListProps {
	messages: UIMessage[];
}

export default function MessageList({ messages }: MessageListProps) {
	return (
		<Box flexDirection="column">
			{messages.map((msg, i) => {
				if (msg.role === 'user') {
					return (
						<Box key={i} flexDirection='row' borderStyle='round'>
								<Text color="green" bold>
									{'❯ '}
								</Text>
								<Text>{msg.parts.filter(p => p.type === 'text').map(p => (p as { text: string }).text).join('')}</Text>
						</Box>
					);
				}

				return <AssistantMessage key={i} message={msg} />;
			})}
		</Box>
	);
}
