import type { Mode } from '../utils/permissions.js';

export type ToolMetadata = {
	description: string;
	readOnly: boolean;
	interactive?: boolean;
	allowedModes: Mode[];
};

export const toolMetadata: Record<string, ToolMetadata> = {
	readFile: {
		description:
			'Read the contents of a file at the specified path. Returns the file contents with line numbers. Use this to understand existing code before making changes.',
		readOnly: true,
		allowedModes: ['plan', 'code', 'yolo'],
	},
	writeFile: {
		description:
			'Create a new file or overwrite an existing file when explicitly allowed. Use editFile for partial modifications instead.',
		readOnly: false,
		allowedModes: ['code', 'yolo'],
	},
	editFile: {
		description:
			'Make a targeted edit to a file by replacing an exact string match with new content. The oldString must match exactly, including whitespace and indentation.',
		readOnly: false,
		allowedModes: ['code', 'yolo'],
	},
	executeCommand: {
		description:
			'Execute a shell command and return its output. Supports bounded output, optional background execution, and timeout controls.',
		readOnly: false,
		allowedModes: ['code', 'yolo'],
	},
	grepSearch: {
		description:
			'A powerful search tool built on ripgrep. Search for a pattern across files with support for content results, context lines, pagination, and path filtering.',
		readOnly: true,
		allowedModes: ['plan', 'code', 'yolo'],
	},
	globSearch: {
		description:
			'Fast file pattern matching across the codebase with glob filters, exclusions, pagination, and depth limits.',
		readOnly: true,
		allowedModes: ['plan', 'code', 'yolo'],
	},
	listDir: {
		description:
			'List the files and directories inside a directory, including lightweight metadata like entry type and size.',
		readOnly: true,
		allowedModes: ['plan', 'code', 'yolo'],
	},
	toolSearch: {
		description:
			'Search the available tools by name, description, mode support, or interaction style to discover the right capability to use.',
		readOnly: true,
		allowedModes: ['plan', 'code', 'yolo'],
	},
	webSearch: {
		description:
			'Search the web for up-to-date information using Tavily and return relevant results with snippets and source URLs.',
		readOnly: true,
		allowedModes: ['plan', 'code', 'yolo'],
	},
	askUserQuestion: {
		description:
			'Ask the user a structured question with predefined options and wait for a selection before continuing.',
		readOnly: true,
		interactive: true,
		allowedModes: ['plan', 'code', 'yolo'],
	},
	exitPlanMode: {
		description:
			'Ask the user to confirm leaving plan mode and beginning implementation work.',
		readOnly: true,
		interactive: true,
		allowedModes: ['plan', 'code', 'yolo'],
	},
	todoWrite: {
		description:
			'Create or update a structured todo list so the agent can track multi-step work with explicit status and priority fields.',
		readOnly: false,
		allowedModes: ['plan', 'code', 'yolo'],
	},
};

export type ToolName = keyof typeof toolMetadata;

export const allToolNames = Object.keys(toolMetadata) as ToolName[];

export function getToolMetadata(name: string): ToolMetadata | undefined {
	return toolMetadata[name as ToolName];
}

export function getAllowedToolNamesForMode(mode: Mode): Set<ToolName> {
	return new Set(
		allToolNames.filter((name) => {
			const metadata = toolMetadata[name];
			return metadata != null && metadata.allowedModes.includes(mode);
		}),
	);
}

export function getReadOnlyToolNames(): Set<ToolName> {
	return new Set(
		allToolNames.filter((name) => {
			const metadata = toolMetadata[name];
			return metadata != null && metadata.readOnly;
		}),
	);
}

export function isInteractiveToolName(name: string): boolean {
	return toolMetadata[name as ToolName]?.interactive === true;
}
