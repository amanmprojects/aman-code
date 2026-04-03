import React from 'react';
import { Box, Text } from 'ink';
import Markdown from './Markdown.js';
import ToolCallStatus from './ToolCallStatus.js';
import { isToolUIPart, type UIMessage } from 'ai';

interface AssistantMessageProps {
	message: UIMessage;
}

export default function AssistantMessage({ message }: AssistantMessageProps) {
	return (
		<Box flexDirection="column" marginBottom={1}>
			{message.parts.map((part, i) => {
				if (part.type === 'text' && part.text) {
					return (
						<Box key={`text-${i}`} marginLeft={2} marginTop={1}>
							<Markdown>{part.text}</Markdown>
						</Box>
					);
				}

				if (part.type === 'reasoning') {
					return (
						<Box key={`reasoning-${i}`} marginLeft={2} marginTop={1}>
							<Text color='grey'>{part.text}</Text>
						</Box>
					);
				}

				if (isToolUIPart(part)) {
					return (
						<Box key={`tool-${i}`} marginLeft={2} marginTop={1}>
							<ToolCallStatus toolPart={part} />
						</Box>
					);
				}

				return null;
			})}
		</Box>
	);
}
