import React from 'react';
import { Text } from 'ink';
import { marked } from 'marked';
import * as MarkedTerminalModule from 'marked-terminal';

interface MarkdownProps {
	children: string;
}

const markedTerminal = (MarkedTerminalModule as unknown as {
	markedTerminal: () => { renderer: Record<string, (...arguments_: unknown[]) => string> };
}).markedTerminal;

marked.use(markedTerminal());

export default function Markdown({ children }: MarkdownProps) {
	return <Text>{marked.parse(children, { async: false }).trim()}</Text>;
}
