import React, { memo } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { UIMessage } from 'ai';
import DiffView from './DiffView.js';

type ToolPart = Extract<UIMessage['parts'][number], { toolCallId: string }>;

interface ToolCallStatusProps {
	toolPart: ToolPart;
}

const TOOL_ICONS: Record<string, string> = {
	readFile: '📄',
	writeFile: '✏️',
	editFile: '🔧',
	executeCommand: '⚡',
	grepSearch: '🔍',
	globSearch: '📂',
	listDir: '🗂️',
	toolSearch: '🧭',
	webSearch: '🌐',
	askUserQuestion: '❓',
	exitPlanMode: '🚦',
	todoWrite: '✅',
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
			return `"${args['pattern'] ?? ''}" in ${args['path'] ?? args['searchPath'] ?? '.'}`;
		case 'listDir':
			return args['path'] ?? '.';
		case 'toolSearch':
			return args['query'] ?? '';
		case 'webSearch':
			return args['query'] ?? '';
		case 'askUserQuestion':
			return args['question'] ?? '';
		case 'exitPlanMode':
			return args['planSummary'] ?? 'requesting plan handoff';
		case 'todoWrite':
			return `${Array.isArray(args['todos']) ? args['todos'].length : 0} todos`;
		default:
			return JSON.stringify(args).slice(0, 80);
	}
}

function formatResult(toolName: string, result: any): React.ReactNode {
	if (result == null) {
		return null;
	}

	if (result.error) {
		return <Text color="red">Error: {result.error}</Text>;
	}

	switch (toolName) {
		case 'askUserQuestion':
			return (
				<Text dimColor>
					Selected {Array.isArray(result.selectedLabels) ? result.selectedLabels.join(', ') : 'response'}
				</Text>
			);
		case 'exitPlanMode':
			return <Text dimColor>{result.message ?? 'Plan exit approved.'}</Text>;
		case 'todoWrite':
			if (!result.todos || !Array.isArray(result.todos)) {
				return <Text dimColor>{result.count ?? 0} todo item(s) saved</Text>;
			}
			return (
				<Box flexDirection="column">
					<Text dimColor>{result.todos.length} todo item(s):</Text>
					{result.todos.map((todo: any) => {
						const statusIcon =
							todo.status === 'completed'
								? '✓'
								: todo.status === 'in_progress'
									? '▶'
									: '○';
						const priorityColor =
							todo.priority === 'high'
								? 'red'
								: todo.priority === 'medium'
									? 'yellow'
									: 'dimColor';
						const statusColor =
							todo.status === 'completed'
								? 'green'
								: todo.status === 'in_progress'
									? 'cyan'
									: 'dimColor';
						return (
							<Box key={todo.id} marginLeft={2}>
								<Text color={statusColor}>{statusIcon}</Text>
								<Text> </Text>
								<Text color={priorityColor}>[{todo.priority}]</Text>
								<Text> {todo.content}</Text>
							</Box>
						);
					})}
				</Box>
			);
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
						{(result.numFiles ?? result.resultCount ?? 0)} result{(result.numFiles ?? result.resultCount ?? 0) === 1 ? '' : 's'}
						{result.truncated ? ' (truncated)' : ''}
					</Text>
					{(result.filenames ?? result.results) && (
						<Text>{((result.filenames ?? result.results) as string[]).slice(0, 10).join('\n')}</Text>
					)}
				</Box>
			);
		case 'listDir':
			return (
				<Box flexDirection="column">
					<Text dimColor>
						{result.count ?? 0} entr{result.count === 1 ? 'y' : 'ies'}
						{result.truncated ? ' (truncated)' : ''}
					</Text>
					{Array.isArray(result.entries) ? (
						<Text>{result.entries.slice(0, 10).map((entry: any) => `${entry.type} ${entry.path}`).join('\n')}</Text>
					) : null}
				</Box>
			);
		case 'toolSearch':
			return (
				<Box flexDirection="column">
					<Text dimColor>{result.count ?? 0} matching tool(s)</Text>
					{Array.isArray(result.results) ? (
						<Text>{result.results.slice(0, 10).map((entry: any) => `${entry.name} — ${entry.description}`).join('\n')}</Text>
					) : null}
				</Box>
			);
		case 'webSearch':
			return (
				<Box flexDirection="column">
					<Text dimColor>{Array.isArray(result.results) ? result.results.length : 0} web result(s)</Text>
					{Array.isArray(result.results) ? (
						<Text>{result.results.slice(0, 5).map((entry: any) => entry.title ?? entry.url ?? 'Untitled').join('\n')}</Text>
					) : null}
				</Box>
			);
		default:
			return <Text dimColor>{JSON.stringify(result).slice(0, 200)}</Text>;
	}
}

function ToolCallStatus({ toolPart }: ToolCallStatusProps) {
	const toolName = toolPart.type === 'dynamic-tool' ? toolPart.toolName : toolPart.type.slice(5);
	const icon = TOOL_ICONS[toolName] ?? '🔨';
	const args = (toolPart.input ?? {}) as Record<string, any>;
	const argsStr = formatArgs(toolName, args);
	const isRunning = toolPart.state === 'input-streaming' || toolPart.state === 'input-available';
	const isAwaitingApproval = toolPart.state === 'approval-requested';
	const isApprovalResponded = toolPart.state === 'approval-responded';
	const isDenied = toolPart.state === 'output-denied';
	const isDone = toolPart.state === 'output-available';
	const isError = toolPart.state === 'output-error';

	return (
		<Box flexDirection="column" marginY={0}>
			<Box>
				{isAwaitingApproval ? (
					<Text color="magenta">? </Text>
				) : isRunning ? (
					<Text color="yellow">
						<Spinner type="dots" />{' '}
					</Text>
				) : isApprovalResponded ? (
					<Text color="cyan">… </Text>
				) : isDone ? (
					<Text color="green">✓ </Text>
				) : isDenied ? (
					<Text color="yellow">- </Text>
				) : (
					<Text color="red">✗ </Text>
				)}
				<Text>
					{icon}{' '}
					<Text bold>{toolName}</Text>
					{argsStr ? <Text dimColor> {argsStr}</Text> : null}
				</Text>
			</Box>
			{isAwaitingApproval && (
				<Box marginLeft={2}>
					<Text dimColor>Waiting for approval</Text>
				</Box>
			)}
			{isApprovalResponded && toolPart.approval?.approved != null && (
				<Box marginLeft={2}>
					<Text dimColor>
						{toolPart.approval.approved ? 'Approval received' : 'Approval denied'}
					</Text>
				</Box>
			)}
			{isDone && toolPart.state === 'output-available' && toolPart.output != null && (
				<Box marginLeft={2} flexDirection="column">
					{formatResult(toolName, toolPart.output as any)}
				</Box>
			)}
			{isDenied && toolPart.state === 'output-denied' && (
				<Box marginLeft={2}>
					<Text color="yellow">{toolPart.approval?.reason ?? 'Tool execution denied.'}</Text>
				</Box>
			)}
			{isError && toolPart.state === 'output-error' && toolPart.errorText && (
				<Box marginLeft={2}>
					<Text color="red">{toolPart.errorText}</Text>
				</Box>
			)}
		</Box>
	);
}

// Memoize to prevent re-renders when parent updates but toolPart hasn't changed
export default memo(ToolCallStatus, (prevProps, nextProps) => {
	// Only re-render if state or output changes
	return (
		prevProps.toolPart.state === nextProps.toolPart.state &&
		prevProps.toolPart.toolCallId === nextProps.toolPart.toolCallId &&
		// For output-available state, also check if output changed
		(prevProps.toolPart.state !== 'output-available' ||
			JSON.stringify(prevProps.toolPart.output) === JSON.stringify(nextProps.toolPart.output))
	);
});
