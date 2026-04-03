import {tool} from 'ai';
import {z} from 'zod';
import {execFile} from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {isBlockedDevicePath, isUNCPath} from './pathGuards.js';

const VCS_DIRECTORIES_TO_EXCLUDE = ['.git', '.svn', '.hg', '.bzr', '.jj', '.sl'];
const DEFAULT_HEAD_LIMIT = 250;
const EXCLUDED_DIRECTORIES = ['node_modules', 'dist', 'build', '.next', '.cache'];

type RipgrepTextField = {
	text?: string;
	bytes?: string;
};

type RipgrepOutputRecord = {
	type: 'begin' | 'match' | 'context' | 'end' | 'summary';
	data?: {
		path?: RipgrepTextField;
		lines?: RipgrepTextField;
		line_number?: number | null;
		submatches?: unknown[];
	};
};

type ParsedRipgrepRecord = {
	type: 'match' | 'context';
	filePath: string;
	lineNumber: number | null;
	text: string;
	submatchCount: number;
};

function applyHeadLimit<T>(
	items: T[],
	limit: number | undefined,
	offset: number = 0,
): {items: T[]; appliedLimit: number | undefined; wasTruncated: boolean} {
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
	if (appliedLimit !== undefined) {
		parts.push(`limit: ${appliedLimit}`);
	}

	if (appliedOffset) {
		parts.push(`offset: ${appliedOffset}`);
	}

	return parts.join(', ');
}

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
				if (error && error.code !== 1) {
					reject(error);
				} else {
					resolve({stdout: stdout || '', stderr: stderr || ''});
				}
			},
		);
	});
}

function decodeRipgrepText(field: RipgrepTextField | undefined): string {
	if (typeof field?.text === 'string') {
		return field.text;
	}

	if (typeof field?.bytes === 'string') {
		return Buffer.from(field.bytes, 'base64').toString('utf8');
	}

	return '';
}

function parseRipgrepRecords(stdout: string): ParsedRipgrepRecord[] {
	const records: ParsedRipgrepRecord[] = [];

	for (const rawLine of stdout.split('\n')) {
		if (!rawLine.trim()) {
			continue;
		}

		let message: RipgrepOutputRecord;
		try {
			message = JSON.parse(rawLine) as RipgrepOutputRecord;
		} catch {
			continue;
		}

		if (message.type !== 'match' && message.type !== 'context') {
			continue;
		}

		const filePath = decodeRipgrepText(message.data?.path);
		if (!filePath) {
			continue;
		}

		records.push({
			type: message.type,
			filePath,
			lineNumber:
				typeof message.data?.line_number === 'number'
					? message.data.line_number
					: null,
			text: decodeRipgrepText(message.data?.lines),
			submatchCount: Array.isArray(message.data?.submatches)
				? message.data.submatches.length
				: 0,
		});
	}

	return records;
}

function formatRipgrepLine(
	record: ParsedRipgrepRecord,
	showLineNumbers: boolean,
): string {
	const displayPath = toRelativePath(record.filePath);
	const lineText = record.text.replace(/\n$/, '');

	if (showLineNumbers && record.lineNumber != null) {
		return `${displayPath}:${record.lineNumber}:${lineText}`;
	}

	return `${displayPath}:${lineText}`;
}

function searchPathError(targetPath: string, kind: 'unc' | 'device') {
	if (kind === 'unc') {
		return `Cannot search UNC path: ${targetPath}. Use a local path instead.`;
	}

	return `Cannot search device path: ${targetPath}. This path would block or produce infinite output.`;
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
				'Output mode: "content" shows matching lines with context, "files_with_matches" shows only file paths (default), "count" shows total matches per file',
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
				'Show line numbers in output (derived from rg JSON output). Requires outputMode: "content", ignored otherwise. Defaults to true.',
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

			if ((targetPath && isUNCPath(targetPath)) || isUNCPath(resolved)) {
				return {error: searchPathError(targetPath ?? resolved, 'unc')};
			}

			if (
				(targetPath && isBlockedDevicePath(targetPath)) ||
				isBlockedDevicePath(resolved)
			) {
				return {error: searchPathError(targetPath ?? resolved, 'device')};
			}

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

			for (const dir of VCS_DIRECTORIES_TO_EXCLUDE) {
				args.push('--glob', `!${dir}`);
			}

			for (const dir of EXCLUDED_DIRECTORIES) {
				args.push('--glob', `!${dir}`);
			}

			args.push('--max-columns', '500');

			if (multiline) {
				args.push('-U', '--multiline-dotall');
			}

			if (fixedStrings) {
				args.push('-F');
			}

			if (caseSensitive === false) {
				args.push('-i');
			}

			if (outputMode === 'files_with_matches') {
				args.push('-l');
			} else {
				args.push('--json');
			}

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

			if (type) {
				args.push('--type', type);
			}

			const globPatterns = [
				...(glob?.trim() ? [glob.trim()] : []),
				...(includes ?? []),
			].filter(Boolean);
			for (const globPattern of globPatterns) {
				args.push('--glob', globPattern);
			}

			if (pattern.startsWith('-')) {
				args.push('-e', pattern);
			} else {
				args.push(pattern);
			}

			args.push(resolved);

			const {stdout} = await execFileAsync('rg', args, {
				timeout: 30_000,
				maxBuffer: 10 * 1024 * 1024,
			});

			if (outputMode === 'content') {
				const records = parseRipgrepRecords(stdout);
				const totalMatchCount = records
					.filter(record => record.type === 'match')
					.reduce((sum, record) => sum + record.submatchCount, 0);
				const formattedLines = records.map(record =>
					formatRipgrepLine(record, showLineNumbers),
				);
				const {
					items: limitedLines,
					appliedLimit,
					wasTruncated,
				} = applyHeadLimit(formattedLines, headLimit, offset);
				const limitInfo = formatLimitInfo(
					appliedLimit,
					offset > 0 ? offset : undefined,
				);

				return {
					pattern,
					path: toRelativePath(resolved),
					outputMode,
					matchCount: totalMatchCount,
					matches: limitedLines,
					truncated: wasTruncated,
					content: limitedLines.join('\n') || 'No matches found',
					numLines: limitedLines.length,
					...(appliedLimit !== undefined && {appliedLimit}),
					...(offset > 0 && {appliedOffset: offset}),
					...(limitInfo && {paginationInfo: limitInfo}),
				};
			}

			if (outputMode === 'count') {
				const matchRecords = parseRipgrepRecords(stdout).filter(
					record => record.type === 'match',
				);
				const countsByFile = new Map<string, number>();

				for (const record of matchRecords) {
					countsByFile.set(
						record.filePath,
						(countsByFile.get(record.filePath) ?? 0) + record.submatchCount,
					);
				}

				const countLines = Array.from(
					countsByFile,
					([filePath, totalMatchesForFile]) =>
						`${toRelativePath(filePath)}:${totalMatchesForFile}`,
				);
				const {
					items: limitedLines,
					appliedLimit,
					wasTruncated,
				} = applyHeadLimit(countLines, headLimit, offset);
				const totalMatches = Array.from(countsByFile.values()).reduce(
					(sum, count) => sum + count,
					0,
				);
				const limitInfo = formatLimitInfo(
					appliedLimit,
					offset > 0 ? offset : undefined,
				);

				return {
					pattern,
					path: toRelativePath(resolved),
					outputMode,
					numFiles: countsByFile.size,
					numMatches: totalMatches,
					matchCount: totalMatches,
					matches: limitedLines,
					truncated: wasTruncated,
					content: limitedLines.join('\n') || 'No matches found',
					...(appliedLimit !== undefined && {appliedLimit}),
					...(offset > 0 && {appliedOffset: offset}),
					...(limitInfo && {paginationInfo: limitInfo}),
				};
			}

			const lines = stdout.trim().split('\n').filter(Boolean);
			const stats = await Promise.allSettled(
				lines.map(filePath => fs.stat(filePath)),
			);
			const sortedMatches = lines
				.map((filePath, index) => {
					const result = stats[index]!;
					const mtimeMs =
						result.status === 'fulfilled' ? result.value.mtimeMs ?? 0 : 0;
					return {filePath, mtimeMs};
				})
				.sort((left, right) => {
					if (process.env['NODE_ENV'] === 'test') {
						return left.filePath.localeCompare(right.filePath);
					}

					const timeComparison = right.mtimeMs - left.mtimeMs;
					if (timeComparison === 0) {
						return left.filePath.localeCompare(right.filePath);
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

				if (sortedMatches.length === 0) {
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

			const isTruncated = offset + relativeMatches.length < sortedMatches.length;

				return {
					pattern,
					path: toRelativePath(resolved),
					outputMode,
					numFiles: sortedMatches.length,
					matchCount: sortedMatches.length,
					matches: relativeMatches,
					truncated: isTruncated,
					filenames: relativeMatches,
				...(appliedLimit !== undefined && {appliedLimit}),
				...(offset > 0 && {appliedOffset: offset}),
				...(limitInfo && {paginationInfo: limitInfo}),
			};
		} catch (error: any) {
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
