import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { ToolCallInfo } from '../hooks/useAgent.js';
import DiffView from './DiffView.js';

interface ToolCallStatusProps {
	toolCall: ToolCallInfo;
}

const TOOL_ICONS: Record<string, string> = {
	readFile: '📄',
	writeFile: '✏️',
	editFile: '🔧',
	executeCommand: '⚡',
	grepSearch: '🔍',
	globSearch: '📂',
};

function formatArgs(toolName: string, args: Record<string, any>): string {
	switch (toolName) {
		case 'readFile':
			return args['filePath'] ?? '';
		case 'writeFile':
			return args['filePath'] ?? '';
		case 'editFile':
			return args['filePath'] ?? '';
		case 'executeCommand':
			return args['command'] ?? '';
		case 'grepSearch':
			return `"${args['pattern'] ?? ''}" in ${args['searchPath'] ?? '.'}`;
		case 'globSearch':
			return `"${args['pattern'] ?? ''}" in ${args['searchPath'] ?? '.'}`;
		default:
			return JSON.stringify(args).slice(0, 80);
	}
}

function formatResult(toolName: string, result: any): React.ReactNode {
	if (!result) {
		return null;
	}

	if (result.error) {
		return <Text color="red">Error: {result.error}</Text>;
	}

	switch (toolName) {
		case 'editFile':
			if (result.diff) {
				return <DiffView diff={result.diff} />;
			}

			return <Text dimColor>Edit applied to {result.filePath}</Text>;
		case 'writeFile':
			return (
				<Text dimColor>
					{result.action === 'created' ? 'Created' : 'Wrote'} {result.filePath} ({result.lines} lines)
				</Text>
			);
		case 'readFile':
			if (result.content) {
				const lines = String(result.content).split('\n');
				const preview = lines.slice(0, 10).join('\n');
				const truncated = lines.length > 10;
				return (
					<Box flexDirection="column">
						<Text dimColor>
							{result.filePath} ({result.totalLines} lines)
						</Text>
						<Text>{preview}</Text>
						{truncated && (
							<Text dimColor>... ({lines.length - 10} more lines)</Text>
						)}
					</Box>
				);
			}

			return null;
		case 'executeCommand': {
			const output = result.stdout || result.stderr || '';
			const lines = String(output).split('\n');
			const preview = lines.slice(0, 15).join('\n');
			const truncated = lines.length > 15;
			return (
				<Box flexDirection="column">
					{result.exitCode !== 0 && (
						<Text color="red">Exit code: {result.exitCode}</Text>
					)}
					{preview && <Text>{preview}</Text>}
					{truncated && (
						<Text dimColor>... ({lines.length - 15} more lines)</Text>
					)}
				</Box>
			);
		}

		case 'grepSearch':
			return (
				<Box flexDirection="column">
					<Text dimColor>
						{result.matchCount} match{result.matchCount === 1 ? '' : 'es'}
						{result.truncated ? ' (truncated)' : ''}
					</Text>
					{result.matches && <Text>{String(result.matches).slice(0, 500)}</Text>}
				</Box>
			);
		case 'globSearch':
			return (
				<Box flexDirection="column">
					<Text dimColor>
						{result.resultCount} result{result.resultCount === 1 ? '' : 's'}
					</Text>
					{result.results && (
						<Text>{(result.results as string[]).slice(0, 10).join('\n')}</Text>
					)}
				</Box>
			);
		default:
			return <Text dimColor>{JSON.stringify(result).slice(0, 200)}</Text>;
	}
}

export default function ToolCallStatus({ toolCall }: ToolCallStatusProps) {
	const icon = TOOL_ICONS[toolCall.toolName] ?? '🔨';
	const argsStr = formatArgs(toolCall.toolName, toolCall.args);

	return (
		<Box flexDirection="column" marginY={0}>
			<Box>
				{toolCall.status === 'running' ? (
					<Text color="yellow">
						<Spinner type="dots" />{' '}
					</Text>
				) : toolCall.status === 'done' ? (
					<Text color="green">✓ </Text>
				) : (
					<Text color="red">✗ </Text>
				)}
				<Text>
					{icon}{' '}
					<Text bold>{toolCall.toolName}</Text>
					{argsStr ? <Text dimColor> {argsStr}</Text> : null}
				</Text>
			</Box>
			{toolCall.status === 'done' && toolCall.result && (
				<Box marginLeft={2} flexDirection="column">
					{formatResult(toolCall.toolName, toolCall.result)}
				</Box>
			)}
			{toolCall.status === 'error' && toolCall.error && (
				<Box marginLeft={2}>
					<Text color="red">{toolCall.error}</Text>
				</Box>
			)}
		</Box>
	);
}
