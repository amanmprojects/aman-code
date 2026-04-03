import {tool} from 'ai';
import {z} from 'zod';
import {execFile} from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

// Version control system directories to exclude from searches
const VCS_DIRECTORIES_TO_EXCLUDE = [
	'.git',
	'.svn',
	'.hg',
	'.bzr',
	'.jj',
	'.sl',
];

// Default cap on grep results when head_limit is unspecified
const DEFAULT_HEAD_LIMIT = 250;

// Common directories to exclude
const EXCLUDED_DIRECTORIES = [
	'node_modules',
	'dist',
	'build',
	'.next',
	'.cache',
];

function applyHeadLimit<T>(
	items: T[],
	limit: number | undefined,
	offset: number = 0,
): {items: T[]; appliedLimit: number | undefined; wasTruncated: boolean} {
	// Explicit 0 = unlimited escape hatch
	if (limit === 0) {
		return {
			items: items.slice(offset),
			appliedLimit: undefined,
			wasTruncated: false,
		};
	}
	const effectiveLimit = limit ?? DEFAULT_HEAD_LIMIT;
	const sliced = items.slice(offset, offset + effectiveLimit);
	const wasTruncated = items.length - offset > effectiveLimit;
	return {
		items: sliced,
		appliedLimit: wasTruncated ? effectiveLimit : undefined,
		wasTruncated,
	};
}

function toRelativePath(filePath: string): string {
	const relativePath = path.relative(process.cwd(), filePath);
	if (
		!relativePath ||
		relativePath.startsWith('..') ||
		path.isAbsolute(relativePath)
	) {
		return filePath;
	}
	return relativePath.split(path.sep).join('/');
}

function formatLimitInfo(
	appliedLimit: number | undefined,
	appliedOffset: number | undefined,
): string {
	const parts: string[] = [];
	if (appliedLimit !== undefined) parts.push(`limit: ${appliedLimit}`);
	if (appliedOffset) parts.push(`offset: ${appliedOffset}`);
	return parts.join(', ');
}

// Promisified execFile
function execFileAsync(
	command: string,
	args: string[],
	options: {cwd?: string; timeout?: number; maxBuffer?: number},
): Promise<{stdout: string; stderr: string}> {
	return new Promise((resolve, reject) => {
		execFile(
			command,
			args,
			{
				cwd: options.cwd,
				timeout: options.timeout,
				maxBuffer: options.maxBuffer,
				encoding: 'utf-8',
			},
			(error, stdout, stderr) => {
				// ripgrep returns exit code 1 when no matches found, which is not an error
				if (error && error.code !== 1) {
					reject(error);
				} else {
					resolve({stdout: stdout || '', stderr: stderr || ''});
				}
			},
		);
	});
}

export const grepSearch = tool({
	description:
		'A powerful search tool built on ripgrep. Search for a pattern (regex or fixed string) across files in a directory. Supports multiple output modes, context lines, pagination, and more.',
	inputSchema: z.object({
		pattern: z
			.string()
			.describe(
				'The regular expression pattern to search for in file contents',
			),
		path: z
			.string()
			.optional()
			.describe(
				'File or directory to search in. Defaults to current working directory.',
			),
		searchPath: z
			.string()
			.optional()
			.describe(
				'Deprecated alias for path. The directory or file path to search in.',
			),
		glob: z
			.string()
			.optional()
			.describe(
				'Glob pattern to filter files (e.g. "*.js", "*.{ts,tsx}") - maps to rg --glob',
			),
		includes: z
			.array(z.string())
			.optional()
			.describe(
				'Glob patterns to filter files (e.g. ["*.ts", "*.tsx"]). Alias for glob.',
			),
		outputMode: z
			.enum(['content', 'files_with_matches', 'count'])
			.optional()
			.describe(
				'Output mode: "content" shows matching lines with context, "files_with_matches" shows only file paths (default), "count" shows match counts per file',
			),
		contextBefore: z
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe(
				'Number of lines to show before each match (rg -B). Requires outputMode: "content", ignored otherwise.',
			),
		contextAfter: z
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe(
				'Number of lines to show after each match (rg -A). Requires outputMode: "content", ignored otherwise.',
			),
		context: z
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe(
				'Number of lines to show before and after each match (rg -C). Requires outputMode: "content", ignored otherwise.',
			),
		showLineNumbers: z
			.boolean()
			.optional()
			.describe(
				'Show line numbers in output (rg -n). Requires outputMode: "content", ignored otherwise. Defaults to true.',
			),
		caseSensitive: z
			.boolean()
			.optional()
			.describe(
				'Case sensitive search (default: true). Set to false for case-insensitive search with -i',
			),
		fixedStrings: z
			.boolean()
			.optional()
			.describe('Treat pattern as literal string instead of regex (rg -F)'),
		type: z
			.string()
			.optional()
			.describe(
				'File type to search (rg --type). Common types: js, ts, py, rust, go, java, etc. More efficient than glob for standard file types.',
			),
		headLimit: z
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe(
				'Limit output to first N lines/entries. Works across all output modes. Defaults to 250. Pass 0 for unlimited.',
			),
		offset: z
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe(
				'Skip first N lines/entries before applying headLimit. Works across all output modes. Defaults to 0.',
			),
		multiline: z
			.boolean()
			.optional()
			.describe(
				'Enable multiline mode where . matches newlines and patterns can span lines (rg -U --multiline-dotall). Default: false.',
			),
	}),
	execute: async ({
		pattern,
		path: inputPath,
		searchPath,
		glob,
		includes,
		outputMode = 'files_with_matches',
		contextBefore,
		contextAfter,
		context,
		showLineNumbers = true,
		caseSensitive,
		fixedStrings,
		type,
		headLimit,
		offset = 0,
		multiline,
	}) => {
		try {
			const targetPath = inputPath ?? searchPath;
			const resolved = targetPath ? path.resolve(targetPath) : process.cwd();

			// Validate path exists
			try {
				const stats = await fs.stat(resolved);
				if (!stats.isDirectory() && !stats.isFile()) {
					return {
						error: `Path is not a file or directory: ${targetPath ?? resolved}`,
					};
				}
			} catch (error: any) {
				if (error?.code === 'ENOENT') {
					return {
						error: `Path does not exist: ${
							targetPath ?? resolved
						}. Current working directory: ${process.cwd()}.`,
					};
				}
				throw error;
			}

			const args: string[] = ['--hidden'];

			// Exclude VCS directories
			for (const dir of VCS_DIRECTORIES_TO_EXCLUDE) {
				args.push('--glob', `!${dir}`);
			}

			// Exclude common directories
			for (const dir of EXCLUDED_DIRECTORIES) {
				args.push('--glob', `!${dir}`);
			}

			// Limit line length to prevent minified content clutter
			args.push('--max-columns', '500');

			// Multiline mode
			if (multiline) {
				args.push('-U', '--multiline-dotall');
			}

			// Fixed strings (literal pattern)
			if (fixedStrings) {
				args.push('-F');
			}

			// Case sensitivity (default is case-sensitive)
			if (caseSensitive === false) {
				args.push('-i'); // --ignore-case
			}

			// Output mode
			if (outputMode === 'files_with_matches') {
				args.push('-l');
			} else if (outputMode === 'count') {
				args.push('-c');
			}

			// Line numbers (only for content mode)
			if (showLineNumbers && outputMode === 'content') {
				args.push('-n');
			}

			// Context lines (only for content mode)
			if (outputMode === 'content') {
				if (context !== undefined) {
					args.push('-C', context.toString());
				} else {
					if (contextBefore !== undefined) {
						args.push('-B', contextBefore.toString());
					}
					if (contextAfter !== undefined) {
						args.push('-A', contextAfter.toString());
					}
				}
			}

			// File type filter
			if (type) {
				args.push('--type', type);
			}

			// Glob patterns (from glob parameter or includes array)
			const globPatterns: string[] = [];
			if (glob) {
				// Split only on commas so spaces inside patterns are preserved
				const rawPatterns = glob
					.split(',')
					.map(value => value.trim())
					.filter(Boolean);
				for (const rawPattern of rawPatterns) {
					globPatterns.push(rawPattern);
				}
			}
			if (includes) {
				globPatterns.push(...includes);
			}
			for (const globPattern of globPatterns.filter(Boolean)) {
				args.push('--glob', globPattern);
			}

			// Handle patterns starting with dash (use -e flag)
			if (pattern.startsWith('-')) {
				args.push('-e', pattern);
			} else {
				args.push(pattern);
			}

			// Add path at the end
			args.push(resolved);

			// Execute ripgrep
			const {stdout} = await execFileAsync('rg', args, {
				timeout: 30_000,
				maxBuffer: 10 * 1024 * 1024, // 10MB
			});

			const lines = stdout.trim().split('\n').filter(Boolean);

			// Handle different output modes
			if (outputMode === 'content') {
				// For content mode, apply head limit and offset, then convert paths
				const {
					items: limitedLines,
					appliedLimit,
					wasTruncated,
				} = applyHeadLimit(lines, headLimit, offset);

				const finalLines = limitedLines.map(line => {
					// Lines have format: path:line_content or path:num:content
					// Use regex to find the colon before line number to handle Windows paths like C:\path\file:10:content
					const match = line.match(/^(.+?):(?=\d+:)/);
					if (match) {
						const filePath = match[1]!;
						const rest = line.substring(filePath.length);
						return toRelativePath(filePath) + rest;
					}
					// Fallback for content-mode lines with a single colon-delimited boundary (path:rest)
					const colonIndex = line.lastIndexOf(':');
					if (colonIndex > 0) {
						const filePath = line.substring(0, colonIndex);
						const rest = line.substring(colonIndex);
						return toRelativePath(filePath) + rest;
					}
					return line;
				});

				const limitInfo = formatLimitInfo(
					appliedLimit,
					offset > 0 ? offset : undefined,
				);
				const content = finalLines.join('\n') || 'No matches found';

				return {
					pattern,
					path: toRelativePath(resolved),
					outputMode,
					matchCount: lines.length,
					matches: finalLines,
					truncated: wasTruncated,
					content,
					numLines: finalLines.length,
					...(appliedLimit !== undefined && {appliedLimit}),
					...(offset > 0 && {appliedOffset: offset}),
					...(limitInfo && {paginationInfo: limitInfo}),
				};
			}

			if (outputMode === 'count') {
				// For count mode, apply head limit and offset, then convert paths
				const {
					items: limitedLines,
					appliedLimit,
					wasTruncated,
				} = applyHeadLimit(lines, headLimit, offset);

				const finalLines = limitedLines.map(line => {
					// Lines have format: /absolute/path:count
					const colonIndex = line.lastIndexOf(':');
					if (colonIndex > 0) {
						const filePath = line.substring(0, colonIndex);
						const count = line.substring(colonIndex);
						return toRelativePath(filePath) + count;
					}
					return line;
				});

				// Parse count output to extract total matches and file count
				let totalMatches = 0;
				let fileCount = 0;
				for (const line of finalLines) {
					const colonIndex = line.lastIndexOf(':');
					if (colonIndex > 0) {
						const countStr = line.substring(colonIndex + 1);
						const count = parseInt(countStr, 10);
						if (!isNaN(count)) {
							totalMatches += count;
							fileCount += 1;
						}
					}
				}

				const limitInfo = formatLimitInfo(
					appliedLimit,
					offset > 0 ? offset : undefined,
				);
				const content = finalLines.join('\n') || 'No matches found';

				return {
					pattern,
					path: toRelativePath(resolved),
					outputMode,
					numFiles: fileCount,
					numMatches: totalMatches,
					matchCount: totalMatches,
					matches: [],
					truncated: wasTruncated,
					content,
					...(appliedLimit !== undefined && {appliedLimit}),
					...(offset > 0 && {appliedOffset: offset}),
					...(limitInfo && {paginationInfo: limitInfo}),
				};
			}

			// files_with_matches mode (default)
			// Sort by modification time, apply head limit, convert to relative paths
			const stats = await Promise.allSettled(
				lines.map(filePath => fs.stat(filePath)),
			);

			const sortedMatches = lines
				.map((filePath, i) => {
					const result = stats[i]!;
					const mtimeMs =
						result.status === 'fulfilled' ? result.value.mtimeMs ?? 0 : 0;
					return {filePath, mtimeMs};
				})
				.sort((a, b) => {
					// In tests, sort by filename for deterministic results
					if (process.env['NODE_ENV'] === 'test') {
						return a.filePath.localeCompare(b.filePath);
					}
					const timeComparison = b.mtimeMs - a.mtimeMs;
					if (timeComparison === 0) {
						return a.filePath.localeCompare(b.filePath);
					}
					return timeComparison;
				})
				.map(item => item.filePath);

			const {items: limitedMatches, appliedLimit} = applyHeadLimit(
				sortedMatches,
				headLimit,
				offset,
			);

			const relativeMatches = limitedMatches.map(toRelativePath);
			const limitInfo = formatLimitInfo(
				appliedLimit,
				offset > 0 ? offset : undefined,
			);

			if (relativeMatches.length === 0) {
				return {
					pattern,
					path: toRelativePath(resolved),
					outputMode,
					numFiles: 0,
					filenames: [],
					matchCount: 0,
					matches: [],
					truncated: false,
					message: 'No files found',
				};
			}

			const isTruncated =
				offset + relativeMatches.length < sortedMatches.length;

			return {
				pattern,
				path: toRelativePath(resolved),
				outputMode,
				numFiles: relativeMatches.length,
				matchCount: relativeMatches.length,
				matches: relativeMatches,
				truncated: isTruncated,
				filenames: relativeMatches,
				...(appliedLimit !== undefined && {appliedLimit}),
				...(offset > 0 && {appliedOffset: offset}),
				...(limitInfo && {paginationInfo: limitInfo}),
			};
		} catch (error: any) {
			// Check if ripgrep is not installed
			const missingPath = typeof error.path === 'string' ? error.path : '';
			const missingRg =
				missingPath === 'rg' ||
				missingPath.endsWith(`${path.sep}rg`) ||
				(typeof error.message === 'string' && error.message.includes('rg'));
			if (error.code === 'ENOENT' && missingRg) {
				return {
					error:
						'ripgrep (rg) is not installed. Please install ripgrep to use the grepSearch tool. See: https://github.com/BurntSushi/ripgrep#installation',
				};
			}

			return {
				error: `Search failed: ${error.message || error}`,
			};
		}
	},
});
