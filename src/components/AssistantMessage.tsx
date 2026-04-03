import React, {memo} from 'react';
import {Box, Text} from 'ink';
import Markdown from './Markdown.js';
import ToolCallStatus from './ToolCallStatus.js';
import {isToolUIPart, type UIMessage} from 'ai';

interface AssistantMessageProps {
	message: UIMessage;
	tailLines?: number;
}

function trimToTailLines(text: string, tailLines: number) {
	const lines = text.split('\n');
	if (lines.length <= tailLines) {
		return text;
	}

	return lines.slice(-tailLines).join('\n');
}

/**
 * Render an assistant message composed of its parts (text, reasoning, and tool UI parts).
 *
 * @param message - The `UIMessage` whose `parts` are rendered into Ink components
 * @returns The rendered assistant message as an Ink/React element
 */
function AssistantMessage({message, tailLines}: AssistantMessageProps) {
	return (
		<Box flexDirection="column" marginBottom={1}>
			{message.parts.map((part, i) => {
				if (part.type === 'text' && part.text) {
					const trimmedText =
						tailLines == null
							? part.text
							: trimToTailLines(part.text, tailLines);

					return (
						<Box
							key={`text-${i}`}
							marginLeft={1}
							marginTop={1}
							flexDirection="column"
						>
							<Markdown
								cacheKey={
									tailLines == null
										? `${message.id}:text:${i}`
										: `${message.id}:text:${i}:tail:${tailLines}`
								}
							>
								{trimmedText}
							</Markdown>
						</Box>
					);
				}

				if (part.type === 'reasoning') {
					return (
						<Box key={`reasoning-${i}`} marginLeft={1} marginTop={1}>
							<Text color="grey">{part.text}</Text>
						</Box>
					);
				}

				if (isToolUIPart(part)) {
					return (
						<Box key={`tool-${i}`} marginLeft={1} marginTop={1}>
							<ToolCallStatus toolPart={part} />
						</Box>
					);
				}

				return null;
			})}
		</Box>
	);
}

export default memo(AssistantMessage);
