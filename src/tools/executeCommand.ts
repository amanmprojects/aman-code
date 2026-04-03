import {tool} from 'ai';
import {z} from 'zod';
import {execa, type ExecaError} from 'execa';
import treeKill from 'tree-kill';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const DANGEROUS_PATTERNS = [
	/rm\s+(-[a-zA-Z]*)?r[a-zA-Z]*f?\s+\/(?!\S)/,
	/rm\s+(-[a-zA-Z]*)?f[a-zA-Z]*r?\s+\/(?!\S)/,
	/mkfs/,
	/dd\s+if=/,
	/:\(\)\{\s*:\|:&\s*\};/, // Fork bomb pattern
	/>\s*\/dev\/sd[a-z]/,
	/chmod\s+(-R\s+)?777\s+\//,
	/chown\s+(-R\s+)?.*\s+\//,
	/wget\s+.*\|\s*(ba)?sh/,
	/curl\s+.*\|\s*(ba)?sh/,
	/fork\s*bomb/i,
	/>(\/etc\/passwd|\/etc\/shadow)/,
];

const MS_IN_SECOND = 1000;
const SECONDS_IN_MINUTE = 60;
const DEFAULT_TIMEOUT_MS = 10 * SECONDS_IN_MINUTE * MS_IN_SECOND; // 10 minutes for bun install etc.
const DEFAULT_MAX_OUTPUT_CHARS = 12_000;

const SIGKILL = 137;
const SIGTERM = 143;

type CommandClassification = 'read' | 'search' | 'mutating' | 'unknown';

const READ_ONLY_COMMAND_PATTERNS = [
	/^\s*(pwd|which|whereis|whoami|printenv)\b/i,
	/^\s*(ls|tree|find|fd|stat|wc|head|tail|cat)\b/i,
	/^\s*(grep|rg)\b/i,
	/^\s*git\s+(status|diff|show|log|branch)\b/i,
];

const SEARCH_COMMAND_PATTERNS = [/^\s*(grep|rg|find|fd)\b/i];

/**
 * Classifies a shell command as one of four categories describing its likely effect.
 *
 * @param command - The shell command string to classify.
 * @returns The classification: `search` if the command matches known search patterns,
 * `read` if it matches known read-only patterns, `mutating` if it matches dangerous patterns
 * or contains common file/package/modification tools (e.g., `mv`, `cp`, `sed`, `python`, `npm`, `git`, `chmod`),
 * and `unknown` if none of the above apply.
 */
function classifyCommand(command: string): CommandClassification {
	if (SEARCH_COMMAND_PATTERNS.some(pattern => pattern.test(command))) {
		return 'search';
	}

	if (READ_ONLY_COMMAND_PATTERNS.some(pattern => pattern.test(command))) {
		return 'read';
	}

	if (isDangerousCommand(command)) {
		return 'mutating';
	}

	return /\b(mv|cp|sed|perl|python|node|npm|pnpm|bun|git|touch|mkdir|chmod|chown)\b/i.test(
		command,
	)
		? 'mutating'
		: 'unknown';
}

/**
 * Appends `chunk` to `current` while ensuring the result does not exceed `limit` characters.
 *
 * @param limit - The maximum allowed length of the returned `text` in characters.
 * @returns An object with `text` containing the concatenated (and possibly truncated) result, and `truncated` — `true` if part of `chunk` was omitted or if `current` already met the limit, `false` otherwise.
 */
function appendBoundedText(
	current: string,
	chunk: string,
	limit: number,
): {text: string; truncated: boolean} {
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

/**
 * Formats a duration in milliseconds into a human-readable minutes/seconds string.
 *
 * @param ms - Duration in milliseconds
 * @returns The duration as "{minutes}m {seconds}s" when at least one minute, otherwise as "{seconds}s"
 */
function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;

	if (minutes > 0) {
		return `${minutes}m ${remainingSeconds}s`;
	}
	return `${seconds}s`;
}

/**
 * Detects whether a shell command is potentially dangerous.
 *
 * Tests the provided shell command string against the configured dangerous patterns.
 *
 * @param command - The shell command to evaluate
 * @returns `true` if the command matches any configured dangerous pattern, `false` otherwise.
 */
export function isDangerousCommand(command: string): boolean {
	return DANGEROUS_PATTERNS.some(pattern => pattern.test(command));
}

export const executeCommand = tool({
	description:
		'Execute a shell command and return its output. Supports bounded output, optional background execution, and timeout controls. Optimized for long-running commands like package installs.',
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
			.max(30 * 60_000) // Max 30 minutes
			.optional()
			.describe(
				'Maximum runtime before the command is terminated. Defaults to 10 minutes (600000ms).',
			),
		maxOutputChars: z
			.number()
			.int()
			.positive()
			.max(200_000)
			.optional()
			.describe(
				'Maximum number of stdout or stderr characters to retain. Defaults to 12000.',
			),
		background: z
			.boolean()
			.optional()
			.describe(
				'If true, start the command in the background and return immediately.',
			),
	}),
	execute: async (
		{
			command,
			cwd,
			timeoutMs = DEFAULT_TIMEOUT_MS,
			maxOutputChars = DEFAULT_MAX_OUTPUT_CHARS,
			background = false,
		},
		options,
	) => {
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
				// For background execution, use execa with detached mode
				const subprocess = execa(command, [], {
					cwd: resolvedCwd,
					shell: true,
					detached: true,
					stdio: 'ignore',
					env: process.env,
					reject: false,
				});

				// Unref the subprocess so it doesn't block the event loop
				subprocess.unref?.();

				// Return immediately with PID, don't wait for completion
				return {
					command,
					cwd: resolvedCwd,
					classification,
					background: true,
					pid: subprocess.pid,
					startedAt,
				};
			}

			// Use execa for better cross-platform handling and timeout management
			const execaOptions = {
				cwd: resolvedCwd,
				shell: true,
				env: process.env,
				timeout: timeoutMs,
				reject: false, // Never throw, always resolve with result object
				signal: options.abortSignal,
				all: true, // Combine stdout and stderr for easier handling
			};

			// For streaming output with bounds, we need to handle it manually
			let stdout = '';
			let stderr = '';
			let stdoutTruncated = false;
			let stderrTruncated = false;
			let timedOut = false;
			let aborted = false;
			let exitCode: number | null = null;

			// Use execa with streaming for bounded output
			const subprocess = execa(command, [], {
				...execaOptions,
				buffer: false, // Don't buffer, we'll handle it
			});

			const timeoutHandler = () => {
				timedOut = true;
				if (subprocess.pid) {
					treeKill(subprocess.pid, 'SIGTERM');
				}
			};

			const abortHandler = () => {
				aborted = true;
				if (subprocess.pid) {
					treeKill(subprocess.pid, 'SIGTERM');
				}
			};

			// Handle timeout manually for better control
			const timeoutId = setTimeout(timeoutHandler, timeoutMs);

			// Unref the timeout so it doesn't block the event loop
			timeoutId.unref();

			// Handle abort signal
			if (options.abortSignal) {
				options.abortSignal.addEventListener('abort', abortHandler, {
					once: true,
				});
			}

			// Stream stdout with bounds
			subprocess.stdout?.setEncoding('utf8');
			subprocess.stdout?.on('data', (chunk: string) => {
				const result = appendBoundedText(stdout, chunk, maxOutputChars);
				stdout = result.text;
				stdoutTruncated ||= result.truncated;
			});

			// Stream stderr with bounds
			subprocess.stderr?.setEncoding('utf8');
			subprocess.stderr?.on('data', (chunk: string) => {
				const result = appendBoundedText(stderr, chunk, maxOutputChars);
				stderr = result.text;
				stderrTruncated ||= result.truncated;
			});

			let result;
			try {
				// Wait for process to complete
				result = await subprocess;
			} finally {
				clearTimeout(timeoutId);
				if (options.abortSignal) {
					options.abortSignal.removeEventListener('abort', abortHandler);
				}
			}

			exitCode = result.exitCode ?? (result.timedOut ? SIGTERM : 1);

			// If we didn't capture output through streaming (e.g., small output), use result
			if (!stdout && result.stdout) {
				const bounded = appendBoundedText(
					'',
					String(result.stdout),
					maxOutputChars,
				);
				stdout = bounded.text;
				stdoutTruncated = bounded.truncated;
			}
			if (!stderr && result.stderr) {
				const bounded = appendBoundedText(
					'',
					String(result.stderr),
					maxOutputChars,
				);
				stderr = bounded.text;
				stderrTruncated = bounded.truncated;
			}

			// Prepend timeout message if timed out
			if (result.timedOut || timedOut) {
				stderr = `Command timed out after ${formatDuration(
					timeoutMs,
				)}\n${stderr}`;
			}

			if (aborted) {
				stderr = `Command cancelled by user\n${stderr}`;
			}

			// Handle kill signals
			if (
				!aborted &&
				(exitCode === SIGKILL || exitCode === SIGTERM || result.signal)
			) {
				timedOut = true;
			}

			return {
				command,
				cwd: resolvedCwd,
				classification,
				background: false,
				durationMs: Date.now() - startedAt,
				timeoutMs,
				timedOut,
				aborted,
				stdout: stdout.trimEnd(),
				stderr: stderr.trimEnd(),
				stdoutTruncated,
				stderrTruncated,
				exitCode,
				signal: result.signal,
				...(result.failed && result.shortMessage
					? {error: result.shortMessage}
					: {}),
			};
		} catch (error: unknown) {
			const execaError = error as ExecaError;
			return {
				command,
				cwd: resolvedCwd,
				classification,
				background: false,
				stdout: '',
				stderr: '',
				exitCode:
					execaError?.exitCode ?? (execaError?.code === 'ENOENT' ? 127 : 1),
				error:
					execaError?.shortMessage ||
					(error instanceof Error ? error.message : String(error)),
			};
		}
	},
});
