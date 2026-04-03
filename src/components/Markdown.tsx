import React from 'react';
import { Text } from 'ink';
import { marked, type MarkedOptions } from 'marked';
import TerminalRenderer from 'marked-terminal';

interface MarkdownProps {
	children: string;
}

const renderer = new TerminalRenderer() as unknown as MarkedOptions['renderer'];

marked.use({ renderer });

export default function Markdown({ children }: MarkdownProps) {
	return <Text>{marked.parse(children, { async: false }).trim()}</Text>;
}
