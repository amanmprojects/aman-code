export type Mode = 'plan' | 'code' | 'yolo';

import {
	getAllowedToolNamesForMode,
	getReadOnlyToolNames,
	isInteractiveToolName,
	type ToolName,
} from '../tools/toolMetadata.js';

export const MODES: Record<Mode, { label: string; color: string; description: string }> = {
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
	switch (mode) {
		case 'plan':
			return getAllowedToolNamesForMode(mode);
		case 'code':
		case 'yolo':
			return getAllowedToolNamesForMode(mode);
		default:
			return getAllowedToolNamesForMode('plan');
	}
}

export function isReadOnlyToolName(name: string): boolean {
	return READ_ONLY_TOOLS.has(name as ToolName);
}

export function isInteractiveTool(name: string): boolean {
	return isInteractiveToolName(name);
}
