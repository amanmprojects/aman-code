import type {Mode} from '../utils/permissions.js';
import {getReadFileDescription} from './ReadFile/prompt.js';
import {getWriteFileDescription} from './WriteFile/prompt.js';
import {getEditFileDescription} from './EditFile/prompt.js';
import {getExecuteCommandDescription} from './ExecuteCommand/prompt.js';
import {getGrepSearchDescription} from './GrepSearch/prompt.js';
import {getGlobSearchDescription} from './GlobSearch/prompt.js';
import {getListDirDescription} from './ListDir/prompt.js';
import {getToolSearchDescription} from './ToolSearch/prompt.js';
import {getWebSearchDescription} from './WebSearch/prompt.js';
import {getAskUserQuestionDescription} from './AskUserQuestion/prompt.js';
import {getExitPlanModeDescription} from './ExitPlanMode/prompt.js';
import {getTodoWriteDescription} from './TodoWrite/prompt.js';

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
		description: getReadFileDescription(),
		readOnly: true,
		allowedModes: ['plan', 'code', 'yolo'],
	},
	writeFile: {
		description: getWriteFileDescription(),
		readOnly: false,
		allowedModes: ['code', 'yolo'],
	},
	editFile: {
		description: getEditFileDescription(),
		readOnly: false,
		allowedModes: ['code', 'yolo'],
	},
	executeCommand: {
		description: getExecuteCommandDescription(),
		readOnly: false,
		allowedModes: ['code', 'yolo'],
	},
	grepSearch: {
		description: getGrepSearchDescription(),
		readOnly: true,
		allowedModes: ['plan', 'code', 'yolo'],
	},
	globSearch: {
		description: getGlobSearchDescription(),
		readOnly: true,
		allowedModes: ['plan', 'code', 'yolo'],
	},
	listDir: {
		description: getListDirDescription(),
		readOnly: true,
		allowedModes: ['plan', 'code', 'yolo'],
	},
	toolSearch: {
		description: getToolSearchDescription(),
		readOnly: true,
		allowedModes: ['plan', 'code', 'yolo'],
	},
	webSearch: {
		description: getWebSearchDescription(),
		readOnly: true,
		allowedModes: ['plan', 'code', 'yolo'],
	},
	askUserQuestion: {
		description: getAskUserQuestionDescription(),
		readOnly: true,
		interactive: true,
		allowedModes: ['plan', 'code', 'yolo'],
	},
	exitPlanMode: {
		description: getExitPlanModeDescription(),
		readOnly: true,
		interactive: true,
		allowedModes: ['plan'],
	},
	todoWrite: {
		description: getTodoWriteDescription(),
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
