import React, {memo} from 'react';
import {Box, Text} from 'ink';
import {isToolUIPart, type UIMessage} from 'ai';
import Markdown from './Markdown.js';
import ToolCallStatus from './ToolCallStatus.js';

type AssistantMessageProps = {
	readonly message: UIMessage;
	readonly tailLines?: number;
};

function trimToTailLines(text: string, tailLines: number) {
	if (tailLines <= 0) {
		return '';
	}

	const lines = text.split('\n');
	if (lines.length <= tailLines) {
		return text;
	}

	return lines.slice(-tailLines).join('\n');
}

function getLineCount(text: string) {
	return text.split('\n').length;
}

/**
 * Render an assistant message composed of its parts (text, reasoning, and tool UI parts).
 *
 * @param message - The `UIMessage` whose `parts` are rendered into Ink components
 * @returns The rendered assistant message as an Ink/React element
 */
function AssistantMessage({message, tailLines}: AssistantMessageProps) {
	const trimmedTextByIndex = new Map<number, string>();

	if (tailLines !== undefined) {
		let tailLinesRemaining = tailLines;

		for (let index = message.parts.length - 1; index >= 0; index -= 1) {
			const part = message.parts[index];
			if (part?.type !== 'text' || !part.text) {
				continue;
			}

			const lineCount = getLineCount(part.text);
			const linesForPart = Math.min(lineCount, Math.max(0, tailLinesRemaining));

			trimmedTextByIndex.set(
				index,
				linesForPart >= lineCount
					? part.text
					: trimToTailLines(part.text, linesForPart),
			);

			tailLinesRemaining -= lineCount;
		}
	}

	return (
		<Box flexDirection="column" marginBottom={1}>
			{message.parts.map((part, i) => {
				if (part.type === 'text' && part.text) {
					const trimmedText =
						tailLines === undefined
							? part.text
							: (trimmedTextByIndex.get(i) ?? '');

					if (trimmedText.length === 0) {
						return null;
					}

					return (
						<Box
							key={`text-${i}`}
							marginLeft={1}
							marginTop={1}
							flexDirection="column"
						>
							<Markdown
								cacheKey={
									tailLines === undefined
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
