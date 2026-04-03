import type {Mode} from '../utils/permissions.js';

export type ToolMetadata = {
	description: string;
	readOnly: boolean;
	interactive?: boolean;
	allowedModes: Mode[];
};

export type ToolName =
	| 'readFile'
	| 'writeFile'
	| 'editFile'
	| 'executeCommand'
	| 'grepSearch'
	| 'globSearch'
	| 'listDir'
	| 'toolSearch'
	| 'webSearch'
	| 'askUserQuestion'
	| 'exitPlanMode'
	| 'todoWrite';

export const toolMetadata = {
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
		allowedModes: ['plan'],
	},
	todoWrite: {
		description:
			'Create or update a structured todo list so the agent can track multi-step work with explicit status and priority fields.',
		readOnly: false,
		allowedModes: ['plan', 'code', 'yolo'],
	},
} as const satisfies Record<ToolName, ToolMetadata>;

export const allToolNames = Object.keys(toolMetadata) as ToolName[];

/**
 * Retrieve metadata for a tool by its name.
 *
 * @param name - The tool name to look up
 * @returns The tool's metadata if present, `undefined` otherwise.
 */
export function getToolMetadata(name: string): ToolMetadata | undefined {
	return toolMetadata[name as ToolName];
}

/**
 * Get the set of tool names permitted in the given mode.
 *
 * @param mode - The mode used to filter tools
 * @returns A set of tool names whose metadata includes the provided `mode` in `allowedModes`
 */
export function getAllowedToolNamesForMode(mode: Mode): Set<ToolName> {
	return new Set(
		allToolNames.filter(name => {
			const metadata = toolMetadata[name] as ToolMetadata | undefined;
			return metadata != null && metadata.allowedModes.includes(mode);
		}),
	);
}

/**
 * Get the set of tool names marked as read-only.
 *
 * @returns A `Set` containing the `ToolName` entries whose `readOnly` metadata is `true`.
 */
export function getReadOnlyToolNames(): Set<ToolName> {
	return new Set(
		allToolNames.filter(name => {
			const metadata = toolMetadata[name] as ToolMetadata | undefined;
			return metadata != null && metadata.readOnly;
		}),
	);
}

/**
 * Determine whether the given tool name is marked as interactive in the tool registry.
 *
 * @returns `true` if the tool exists in `toolMetadata` and its `interactive` flag is `true`, `false` otherwise.
 */
export function isInteractiveToolName(name: string): boolean {
	const metadata = toolMetadata[name as ToolName] as ToolMetadata | undefined;
	return metadata?.interactive === true;
}
