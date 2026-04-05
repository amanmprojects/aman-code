import {
	getAllowedToolNamesForMode,
	getReadOnlyToolNames,
	type ToolName,
} from '../tools/toolMetadata.js';

export type Mode = 'plan' | 'code' | 'yolo';

export const modes = {
	plan: {
		label: 'PLAN',
		color: 'blue',
		description: 'Read-only mode — no file writes or command execution',
	},
	code: {
		label: 'CODE',
		color: 'yellow',
		description: 'Standard mode — blocks dangerous commands',
	},
	yolo: {
		label: 'YOLO',
		color: 'red',
		description: 'Unrestricted mode — no safety checks',
	},
} as const;

export type ModeColor = (typeof modes)[Mode]['color'];

export function isValidMode(value: string): value is Mode {
	return Object.hasOwn(modes, value);
}

const readOnlyTools = getReadOnlyToolNames();

/**
 * Retrieve the set of tool names allowed for the specified mode.
 *
 * @param mode - The mode to query (`'plan' | 'code' | 'yolo'`). If an unrecognized value is provided, the function falls back to `'plan'`.
 * @returns The set of `ToolName` values permitted for the given mode.
 */
export function getAllowedToolNames(mode: Mode): Set<ToolName> {
	return getAllowedToolNamesForMode(mode);
}

/**
 * Determines whether a tool name is classified as read-only.
 *
 * @param name - The tool name to check
 * @returns `true` if the given name corresponds to a read-only tool, `false` otherwise.
 */
export function isReadOnlyToolName(name: string): boolean {
	return readOnlyTools.has(name as ToolName);
}

/**
 * Checks whether a tool name corresponds to an interactive tool.
 *
 * @param name - The tool name to check
 * @returns `true` if the tool is interactive, `false` otherwise
 */

export {isInteractiveToolName as isInteractiveTool} from '../tools/toolMetadata.js';
