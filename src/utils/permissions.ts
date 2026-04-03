import {
	getAllowedToolNamesForMode,
	getReadOnlyToolNames,
	isInteractiveToolName,
	type ToolName,
} from '../tools/toolMetadata.js';

export type Mode = 'plan' | 'code' | 'yolo';

export const MODES: Record<
	Mode,
	{label: string; color: string; description: string}
> = {
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
};

const READ_ONLY_TOOLS = getReadOnlyToolNames();

export function getAllowedToolNames(mode: Mode): Set<ToolName> {
	return getAllowedToolNamesForMode(mode);
}

export function isReadOnlyToolName(name: string): boolean {
	return READ_ONLY_TOOLS.has(name as ToolName);
}

export {isInteractiveToolName as isInteractiveTool};
