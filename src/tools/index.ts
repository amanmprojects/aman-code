import { readFile } from './readFile.js';
import { writeFile } from './writeFile.js';
import { editFile } from './editFile.js';
import { executeCommand, isDangerousCommand } from './executeCommand.js';
import { grepSearch } from './grepSearch.js';
import { globSearch } from './globSearch.js';
import { tool } from 'ai';
import { z } from 'zod';
import type { Mode } from '../utils/permissions.js';

export { readFile, writeFile, editFile, executeCommand, grepSearch, globSearch };

const executeCommandWithModeSafety = tool({
	description: (executeCommand as any).description ?? 'Execute a shell command and return its output.',
	inputSchema: z.object({
		command: z.string().describe('The shell command to execute'),
		cwd: z.string().optional().describe('Working directory for the command.'),
	}),
	execute: async (
		args: { command: string; cwd?: string },
		toolOptions: { experimental_context?: unknown },
	) => {
		const context = toolOptions.experimental_context as { mode?: Mode } | undefined;

		if (context?.mode === 'plan') {
			return {
				error: `Command blocked in PLAN mode: "${args.command}" — command execution is not allowed in PLAN mode. Switch to CODE or YOLO mode to run it.`,
			};
		}

		if (context?.mode === 'code' && isDangerousCommand(args.command)) {
			return {
				error: `Command blocked in CODE mode: "${args.command}" — this looks dangerous. Switch to YOLO mode to run it.`,
			};
		}

		return (executeCommand as any).execute(args, toolOptions);
	},
});

export const allTools = {
	readFile,
	writeFile,
	editFile,
	executeCommand: executeCommandWithModeSafety,
	grepSearch,
	globSearch,
};

export type AgentToolName = keyof typeof allTools;

