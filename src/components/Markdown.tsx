import React from 'react';
import { Text, Box } from 'ink';

interface MarkdownProps {
	text: string;
}

export default function Markdown({ text }: MarkdownProps) {
	const lines = text.split('\n');
	const elements: React.ReactNode[] = [];

	let inCodeBlock = false;
	let codeBlockLines: string[] = [];
	let codeBlockLang = '';

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;

		if (line.startsWith('```')) {
			if (inCodeBlock) {
				// End code block
				elements.push(
					<Box
						key={`code-${i}`}
						borderStyle="round"
						borderColor="gray"
						paddingX={1}
						flexDirection="column"
					>
						{codeBlockLang && (
							<Text dimColor>{codeBlockLang}</Text>
						)}
						{codeBlockLines.map((cl, j) => (
							<Text key={j}>{cl}</Text>
						))}
					</Box>,
				);
				codeBlockLines = [];
				codeBlockLang = '';
				inCodeBlock = false;
			} else {
				// Start code block
				inCodeBlock = true;
				codeBlockLang = line.slice(3).trim();
			}

			continue;
		}

		if (inCodeBlock) {
			codeBlockLines.push(line);
			continue;
		}

		// Headers
		if (line.startsWith('### ')) {
			elements.push(
				<Text key={i} bold color="cyan">
					{line.slice(4)}
				</Text>,
			);
			continue;
		}

		if (line.startsWith('## ')) {
			elements.push(
				<Text key={i} bold color="blue">
					{line.slice(3)}
				</Text>,
			);
			continue;
		}

		if (line.startsWith('# ')) {
			elements.push(
				<Text key={i} bold color="magenta">
					{line.slice(2)}
				</Text>,
			);
			continue;
		}

		// List items
		if (line.startsWith('- ') || line.startsWith('* ')) {
			elements.push(
				<Text key={i}>
					<Text color="gray"> • </Text>
					{renderInline(line.slice(2))}
				</Text>,
			);
			continue;
		}

		// Numbered list
		const numberedMatch = /^(\d+)\.\s(.*)/.exec(line);
		if (numberedMatch) {
			elements.push(
				<Text key={i}>
					<Text color="gray"> {numberedMatch[1]}. </Text>
					{renderInline(numberedMatch[2]!)}
				</Text>,
			);
			continue;
		}

		// Empty line
		if (line.trim() === '') {
			elements.push(<Text key={i}>{' '}</Text>);
			continue;
		}

		// Regular text with inline formatting
		elements.push(<Text key={i}>{renderInline(line)}</Text>);
	}

	// Handle unclosed code block
	if (inCodeBlock && codeBlockLines.length > 0) {
		elements.push(
			<Box
				key="code-unclosed"
				borderStyle="round"
				borderColor="gray"
				paddingX={1}
				flexDirection="column"
			>
				{codeBlockLang && <Text dimColor>{codeBlockLang}</Text>}
				{codeBlockLines.map((cl, j) => (
					<Text key={j}>{cl}</Text>
				))}
			</Box>,
		);
	}

	return <Box flexDirection="column">{elements}</Box>;
}

function renderInline(text: string): React.ReactNode {
	const parts: React.ReactNode[] = [];
	let remaining = text;
	let key = 0;

	while (remaining.length > 0) {
		// Bold: **text**
		const boldMatch = /\*\*(.+?)\*\*/.exec(remaining);
		// Inline code: `text`
		const codeMatch = /`([^`]+)`/.exec(remaining);

		// Find the earliest match
		let earliestMatch: { type: string; match: RegExpExecArray } | null = null;

		if (boldMatch) {
			earliestMatch = { type: 'bold', match: boldMatch };
		}

		if (codeMatch && (!earliestMatch || codeMatch.index < earliestMatch.match.index)) {
			earliestMatch = { type: 'code', match: codeMatch };
		}

		if (!earliestMatch) {
			parts.push(<Text key={key++}>{remaining}</Text>);
			break;
		}

		const { type, match } = earliestMatch;

		// Add text before match
		if (match.index > 0) {
			parts.push(<Text key={key++}>{remaining.slice(0, match.index)}</Text>);
		}

		if (type === 'bold') {
			parts.push(
				<Text key={key++} bold>
					{match[1]}
				</Text>,
			);
		} else if (type === 'code') {
			parts.push(
				<Text key={key++} color="yellow">
					{match[1]}
				</Text>,
			);
		}

		remaining = remaining.slice(match.index + match[0].length);
	}

	return <>{parts}</>;
}
