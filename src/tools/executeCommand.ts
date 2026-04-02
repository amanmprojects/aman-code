import { tool } from 'ai';
import { z } from 'zod';
import { execSync } from 'node:child_process';
import * as path from 'node:path';

const DANGEROUS_PATTERNS = [
	/rm\s+(-[a-zA-Z]*)?r[a-zA-Z]*f?\s+\/(?!\S)/,
	/rm\s+(-[a-zA-Z]*)?f[a-zA-Z]*r?\s+\/(?!\S)/,
	/mkfs/,
	/dd\s+if=/,
	/:\(\)\{\s*:\|:&\s*\};:/,
	/>\s*\/dev\/sd[a-z]/,
	/chmod\s+(-R\s+)?777\s+\//,
	/chown\s+(-R\s+)?.*\s+\//,
	/wget\s+.*\|\s*(ba)?sh/,
	/curl\s+.*\|\s*(ba)?sh/,
	/fork\s*bomb/i,
	/>(\/etc\/passwd|\/etc\/shadow)/,
];

export function isDangerousCommand(command: string): boolean {
	return DANGEROUS_PATTERNS.some(pattern => pattern.test(command));
}

export const executeCommand = tool({
	description:
		'Execute a shell command and return its output. Use this for running builds, tests, git commands, installations, and other CLI operations. Commands run with a 30-second timeout.',
	inputSchema: z.object({
		command: z.string().describe('The shell command to execute'),
		cwd: z
			.string()
			.optional()
			.describe(
				'Working directory for the command. Defaults to current directory.',
			),
	}),
	execute: async ({command, cwd}) => {
		try {
			const resolvedCwd = cwd ? path.resolve(cwd) : process.cwd();

			const output = execSync(command, {
				cwd: resolvedCwd,
				timeout: 30_000,
				encoding: 'utf-8',
				maxBuffer: 1024 * 1024,
				stdio: ['pipe', 'pipe', 'pipe'],
			});

			return {
				command,
				cwd: resolvedCwd,
				stdout: output.trim(),
				exitCode: 0,
			};
		} catch (error: any) {
			return {
				command,
				cwd: cwd ? path.resolve(cwd) : process.cwd(),
				stdout: error.stdout?.trim() ?? '',
				stderr: error.stderr?.trim() ?? '',
				exitCode: error.status ?? 1,
				error: error.message,
			};
		}
	},
});
