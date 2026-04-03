import React, {memo} from 'react';
import {Box, Text} from 'ink';
import Spinner from 'ink-spinner';
import type {UIMessage} from 'ai';
import DiffView from './DiffView.js';

type ToolPart = Extract<UIMessage['parts'][number], {toolCallId: string}>;

interface ToolCallStatusProps {
	toolPart: ToolPart;
}

function deepEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) {
		return true;
	}

	if (typeof left !== typeof right) {
		return false;
	}

	if (left == null || right == null) {
		return false;
	}

	if (Array.isArray(left) && Array.isArray(right)) {
		if (left.length !== right.length) {
			return false;
		}

		for (let index = 0; index < left.length; index += 1) {
			if (!deepEqual(left[index], right[index])) {
				return false;
			}
		}

		return true;
	}

	if (typeof left === 'object' && typeof right === 'object') {
		const leftRecord = left as Record<string, unknown>;
		const rightRecord = right as Record<string, unknown>;
		const leftKeys = Object.keys(leftRecord);
		const rightKeys = Object.keys(rightRecord);

		if (leftKeys.length !== rightKeys.length) {
			return false;
		}

		for (const key of leftKeys) {
			if (!Object.hasOwn(rightRecord, key)) {
				return false;
			}

			if (!deepEqual(leftRecord[key], rightRecord[key])) {
				return false;
			}
		}

		return true;
	}

	return false;
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

/**
 * Produce a concise, human-readable summary of a tool call's arguments.
 *
 * @param toolName - The tool identifier (e.g., `readFile`, `executeCommand`, `grepSearch`) used to select formatting rules.
 * @param args - The argument object supplied to the tool; specific fields (like `filePath`, `command`, `pattern`, `query`, etc.) are extracted when available.
 * @returns A short string describing the tool's primary arguments (for unknown tools, a JSON snapshot truncated to 80 characters).
 */
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
			return `"${args['pattern'] ?? ''}" in ${
				args['path'] ?? args['searchPath'] ?? '.'
			}`;
		case 'globSearch':
			return `"${args['pattern'] ?? ''}" in ${
				args['path'] ?? args['searchPath'] ?? '.'
			}`;
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

/**
 * Convert a tool execution result into a React node suitable for display in the UI.
 *
 * @param toolName - The tool identifier used to select a presentation format (e.g., "readFile", "executeCommand").
 * @param result - The raw result object produced by the tool; may include fields like `content`, `stdout`, `stderr`, `diff`, `todos`, `error`, etc.
 * @returns A React node that visually represents the tool result (formatted preview, diff view, list, or error text), or `null` when `result` is null/undefined.
 */
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
					Selected{' '}
					{Array.isArray(result.selectedLabels)
						? result.selectedLabels.join(', ')
						: 'response'}
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
						const basePriorityColor =
							todo.priority === 'high'
								? 'red'
								: todo.priority === 'medium'
								? 'yellow'
								: 'gray';
						const isDimPriority =
							todo.priority !== 'high' && todo.priority !== 'medium';
						const baseStatusColor =
							todo.status === 'completed'
								? 'green'
								: todo.status === 'in_progress'
								? 'cyan'
								: 'gray';
						const isDimStatus =
							todo.status !== 'completed' && todo.status !== 'in_progress';
						return (
							<Box key={todo.id} marginLeft={2}>
								<Text color={baseStatusColor} dimColor={isDimStatus}>
									{statusIcon}
								</Text>
								<Text> </Text>
								<Text color={basePriorityColor} dimColor={isDimPriority}>
									[{todo.priority}]
								</Text>
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
					{result.action === 'created' ? 'Created' : 'Wrote'} {result.filePath}{' '}
					({result.lines} lines)
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
					{result.matches && (
						<Text>{String(result.matches).slice(0, 500)}</Text>
					)}
				</Box>
			);
		case 'globSearch':
			return (
				<Box flexDirection="column">
					<Text dimColor>
						{result.numFiles ?? result.resultCount ?? 0} result
						{(result.numFiles ?? result.resultCount ?? 0) === 1 ? '' : 's'}
						{result.truncated ? ' (truncated)' : ''}
					</Text>
					{(result.filenames ?? result.results) && (
						<Text>
							{((result.filenames ?? result.results) as string[])
								.slice(0, 10)
								.join('\n')}
						</Text>
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
						<Text>
							{result.entries
								.slice(0, 10)
								.map((entry: any) => `${entry.type} ${entry.path}`)
								.join('\n')}
						</Text>
					) : null}
				</Box>
			);
		case 'toolSearch':
			return (
				<Box flexDirection="column">
					<Text dimColor>{result.count ?? 0} matching tool(s)</Text>
					{Array.isArray(result.results) ? (
						<Text>
							{result.results
								.slice(0, 10)
								.map((entry: any) => `${entry.name} — ${entry.description}`)
								.join('\n')}
						</Text>
					) : null}
				</Box>
			);
		case 'webSearch':
			return (
				<Box flexDirection="column">
					<Text dimColor>
						{Array.isArray(result.results) ? result.results.length : 0} web
						result(s)
					</Text>
					{Array.isArray(result.results) ? (
						<Text>
							{result.results
								.slice(0, 5)
								.map((entry: any) => entry.title ?? entry.url ?? 'Untitled')
								.join('\n')}
						</Text>
					) : null}
				</Box>
			);
		default:
			return <Text dimColor>{JSON.stringify(result).slice(0, 200)}</Text>;
	}
}

/**
 * Render the status view for a single tool call, showing an icon, formatted input arguments, and contextual output, error, or approval information.
 *
 * The component derives the tool name and presentation state from `toolPart`, formats inputs via `formatArgs`, and formats outputs via `formatResult`. It conditionally renders indicators for running, approval requested/responded, denied, done, and error states, and displays approval reasons or error text when present.
 *
 * @param toolPart - The tool call part object containing `toolCallId`, `type`/`toolName`, `input`, `state`, and optional `output`, `errorText`, and `approval` fields used to determine what to render.
 * @returns The Ink/React element representing the tool call status block.
 */
function ToolCallStatus({toolPart}: ToolCallStatusProps) {
	const toolName =
		toolPart.type === 'dynamic-tool'
			? toolPart.toolName
			: toolPart.type.slice(5);
	const icon = TOOL_ICONS[toolName] ?? '🔨';
	const args = (toolPart.input ?? {}) as Record<string, any>;
	const argsStr = formatArgs(toolName, args);
	const isRunning =
		toolPart.state === 'input-streaming' ||
		toolPart.state === 'input-available';
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
					{icon} <Text bold>{toolName}</Text>
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
						{toolPart.approval.approved
							? 'Approval received'
							: 'Approval denied'}
					</Text>
				</Box>
			)}
			{isDone &&
				toolPart.state === 'output-available' &&
				toolPart.output != null && (
					<Box marginLeft={2} flexDirection="column">
						{formatResult(toolName, toolPart.output as any)}
					</Box>
				)}
			{isDenied && toolPart.state === 'output-denied' && (
				<Box marginLeft={2}>
					<Text color="yellow">
						{toolPart.approval?.reason ?? 'Tool execution denied.'}
					</Text>
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
	const prevPart = prevProps.toolPart;
	const nextPart = nextProps.toolPart;

	if (prevPart.toolCallId !== nextPart.toolCallId) {
		return false;
	}

	if (prevPart.type !== nextPart.type || prevPart.state !== nextPart.state) {
		return false;
	}

	if (!deepEqual(prevPart.input, nextPart.input)) {
		return false;
	}

	switch (nextPart.state) {
		case 'input-streaming':
		case 'input-available':
			return true;
		case 'approval-requested':
			return deepEqual(prevPart.approval, nextPart.approval);
		case 'approval-responded':
			return deepEqual(prevPart.approval, nextPart.approval);
		case 'output-error':
			return prevPart.errorText === nextPart.errorText;
		case 'output-denied':
			return (
				prevPart.errorText === nextPart.errorText &&
				deepEqual(prevPart.approval, nextPart.approval)
			);
		case 'output-available':
			return deepEqual(prevPart.output, nextPart.output);
		default:
			return deepEqual(prevPart as unknown, nextPart as unknown);
	}
});
