import { readFile } from './readFile.js';
import { writeFile } from './writeFile.js';
import { editFile } from './editFile.js';
import { executeCommand, isDangerousCommand } from './executeCommand.js';
import { grepSearch } from './grepSearch.js';
import { globSearch } from './globSearch.js';
import { tool } from 'ai';
import { z } from 'zod';
import type { Mode } from '../utils/permissions.js';
import { getAllowedToolNames } from '../utils/permissions.js';

export { readFile, writeFile, editFile, executeCommand, grepSearch, globSearch };

const allTools = {
	readFile,
	writeFile,
	editFile,
	executeCommand,
	grepSearch,
	globSearch,
};

export function getToolsForMode(mode: Mode) {
	const allowed = getAllowedToolNames(mode);
	const tools: Record<string, any> = {};

	for (const [name, t] of Object.entries(allTools)) {
		if (!allowed.has(name)) {
			continue;
		}

		if (name === 'executeCommand' && mode === 'code') {
			// Wrap executeCommand with dangerous command check
			tools[name] = tool({
				description: (t as any).description ?? 'Execute a shell command and return its output.',
				inputSchema: z.object({
					command: z.string().describe('The shell command to execute'),
					cwd: z.string().optional().describe('Working directory for the command.'),
				}),
				execute: async (args: { command: string; cwd?: string }) => {
					if (isDangerousCommand(args.command)) {
						return {
							error: `Command blocked in CODE mode: "${args.command}" — this looks dangerous. Switch to YOLO mode to run it.`,
						};
					}

					return (t as any).execute(args);
				},
			});
		} else {
			tools[name] = t;
		}
	}

	return tools;
}
