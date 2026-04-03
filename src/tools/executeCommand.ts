import { tool } from 'ai';
import { z } from 'zod';
import { spawn, type SpawnOptions } from 'node:child_process';
import * as fs from 'node:fs/promises';
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

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_CHARS = 12_000;

type CommandClassification = 'read' | 'search' | 'mutating' | 'unknown';

const READ_ONLY_COMMAND_PATTERNS = [
	/^\s*(pwd|which|whereis|whoami|printenv)\b/i,
	/^\s*(ls|tree|find|fd|stat|wc|head|tail|cat)\b/i,
	/^\s*(grep|rg)\b/i,
	/^\s*git\s+(status|diff|show|log|branch)\b/i,
];

const SEARCH_COMMAND_PATTERNS = [/^\s*(grep|rg|find|fd)\b/i];

function classifyCommand(command: string): CommandClassification {
	if (SEARCH_COMMAND_PATTERNS.some((pattern) => pattern.test(command))) {
		return 'search';
	}

	if (READ_ONLY_COMMAND_PATTERNS.some((pattern) => pattern.test(command))) {
		return 'read';
	}

	if (isDangerousCommand(command)) {
		return 'mutating';
	}

	return /\b(mv|cp|sed|perl|python|node|npm|pnpm|bun|git|touch|mkdir|chmod|chown)\b/i.test(command)
		? 'mutating'
		: 'unknown';
}

function appendBoundedText(
	current: string,
	chunk: string,
	limit: number,
): { text: string; truncated: boolean } {
	if (current.length >= limit) {
		return {
			text: current,
			truncated: true,
		};
	}

	const remaining = limit - current.length;
	if (chunk.length <= remaining) {
		return {
			text: current + chunk,
			truncated: false,
		};
	}

	return {
		text: current + chunk.slice(0, remaining),
		truncated: true,
	};
}

export function isDangerousCommand(command: string): boolean {
	return DANGEROUS_PATTERNS.some(pattern => pattern.test(command));
}

export const executeCommand = tool({
	description:
		'Execute a shell command and return its output. Supports bounded output, optional background execution, and timeout controls.',
	inputSchema: z.object({
		command: z.string().describe('The shell command to execute'),
		cwd: z
			.string()
			.optional()
			.describe(
				'Working directory for the command. Defaults to current directory.',
			),
		timeoutMs: z
			.number()
			.int()
			.positive()
			.max(5 * 60_000)
			.optional()
			.describe('Maximum runtime before the command is terminated. Defaults to 30000.'),
		maxOutputChars: z
			.number()
			.int()
			.positive()
			.max(200_000)
			.optional()
			.describe('Maximum number of stdout or stderr characters to retain. Defaults to 12000.'),
		background: z
			.boolean()
			.optional()
			.describe('If true, start the command in the background and return immediately.'),
	}),
	execute: async ({command, cwd, timeoutMs = DEFAULT_TIMEOUT_MS, maxOutputChars = DEFAULT_MAX_OUTPUT_CHARS, background = false}, options) => {
		const resolvedCwd = cwd ? path.resolve(cwd) : process.cwd();
		const classification = classifyCommand(command);

		try {
			const cwdStat = await fs.stat(resolvedCwd);
			if (!cwdStat.isDirectory()) {
				return {
					error: `Working directory is not a directory: ${resolvedCwd}`,
				};
			}

			const startedAt = Date.now();

			if (background) {
				const child = spawn(command, {
					cwd: resolvedCwd,
					shell: true,
					detached: true,
					stdio: 'ignore',
					env: process.env,
				});

				child.unref();

				return {
					command,
					cwd: resolvedCwd,
					classification,
					background: true,
					pid: child.pid,
					startedAt,
				};
			}

			const spawnOptions: SpawnOptions = {
				cwd: resolvedCwd,
				shell: true,
				env: process.env,
			};

			if (options.abortSignal) {
				spawnOptions.signal = options.abortSignal;
			}

			const child = spawn(command, spawnOptions);

			let stdout = '';
			let stderr = '';
			let stdoutTruncated = false;
			let stderrTruncated = false;
			let timedOut = false;

			child.stdout?.setEncoding('utf8');
			child.stderr?.setEncoding('utf8');

			child.stdout?.on('data', (chunk: string) => {
				const result = appendBoundedText(stdout, chunk, maxOutputChars);
				stdout = result.text;
				stdoutTruncated ||= result.truncated;
			});

			child.stderr?.on('data', (chunk: string) => {
				const result = appendBoundedText(stderr, chunk, maxOutputChars);
				stderr = result.text;
				stderrTruncated ||= result.truncated;
			});

			const timeout = setTimeout(() => {
				timedOut = true;
				child.kill('SIGTERM');
			}, timeoutMs);

			const result = await new Promise<{
				exitCode: number | null;
				signal: NodeJS.Signals | null;
				error?: string;
			}>((resolve) => {
				child.once('error', (error) => {
					clearTimeout(timeout);
					resolve({
						exitCode: 1,
						signal: null,
						error: error.message,
					});
				});

				child.once('close', (exitCode, signal) => {
					clearTimeout(timeout);
					resolve({exitCode, signal});
				});
			});

			return {
				command,
				cwd: resolvedCwd,
				classification,
				background: false,
				durationMs: Date.now() - startedAt,
				timeoutMs,
				timedOut,
				stdout: stdout.trimEnd(),
				stderr: stderr.trimEnd(),
				stdoutTruncated,
				stderrTruncated,
				exitCode: result.exitCode ?? (timedOut ? 124 : 1),
				signal: result.signal,
				...(result.error ? {error: result.error} : {}),
			};
		} catch (error: any) {
			return {
				command,
				cwd: resolvedCwd,
				classification,
				background: false,
				stdout: '',
				stderr: '',
				exitCode: error?.code === 'ENOENT' ? 127 : 1,
				error: error.message,
			};
		}
	},
});
