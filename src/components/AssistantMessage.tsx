import React from 'react';
import { Box, Text } from 'ink';
import Markdown from './Markdown.js';
import ToolCallStatus from './ToolCallStatus.js';
import type { ChatMessage } from '../hooks/useAgent.js';

interface AssistantMessageProps {
	message: ChatMessage;
}

export default function AssistantMessage({ message }: AssistantMessageProps) {
	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text color="magenta" bold>
				{'◆ '}Assistant
			</Text>
			{message.parts.map((part, i) => {
				if (part.type === 'text' && part.text) {
					return (
						<Box key={`text-${i}`} marginLeft={2}>
							<Markdown text={part.text} />
						</Box>
					);
				}

				if (part.type === 'tool-call' && part.toolCall) {
					return (
						<Box key={`tool-${i}`} marginLeft={2}>
							<ToolCallStatus toolCall={part.toolCall} />
						</Box>
					);
				}

				return null;
			})}
		</Box>
	);
}
