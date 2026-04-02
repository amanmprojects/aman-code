export type Mode = 'plan' | 'code' | 'yolo';

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

const READ_ONLY_TOOLS = new Set(['readFile', 'grepSearch', 'globSearch']);
const ALL_TOOLS = new Set([
	'readFile',
	'writeFile',
	'editFile',
	'executeCommand',
	'grepSearch',
	'globSearch',
]);

export function getAllowedToolNames(mode: Mode): Set<string> {
	switch (mode) {
		case 'plan':
			return READ_ONLY_TOOLS;
		case 'code':
		case 'yolo':
			return ALL_TOOLS;
		default:
			return READ_ONLY_TOOLS;
	}
}
