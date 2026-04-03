import { tool } from 'ai';
import { z } from 'zod';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

const DEFAULT_LIMIT = 100;
const EXCLUDED_DIRECTORIES = new Set(['node_modules', '.git', 'dist']);

type SearchType = 'file' | 'directory' | 'any';

function escapeRegexCharacter(character: string): string {
	return /[|\\{}()[\]^$+.-]/.test(character) ? `\\${character}` : character;
}

function normalizeGlobPattern(pattern: string): string {
	const normalized = pattern.trim().replaceAll('\\', '/');
	return normalized.startsWith('./') ? normalized.slice(2) : normalized;
}

function globToRegExp(pattern: string): RegExp {
	const normalizedPattern = normalizeGlobPattern(pattern);
	let expression = '^';

	for (let index = 0; index < normalizedPattern.length; index++) {
		const character = normalizedPattern[index]!;
		const nextCharacter = normalizedPattern[index + 1];
		const previousCharacter = normalizedPattern[index - 1];
		const followingCharacter = normalizedPattern[index + 2];

		if (character === '*') {
			if (nextCharacter === '*') {
				const isSegmentGlob = followingCharacter === '/' && (index === 0 || previousCharacter === '/');

				if (isSegmentGlob) {
					expression += '(?:.*\\/)?';
					index += 2;
					continue;
				}

				expression += '.*';
				index += 1;
				continue;
			}

			expression += '[^/]*';
			continue;
		}

		if (character === '?') {
			expression += '[^/]';
			continue;
		}

		if (character === '/') {
			expression += '\\/';
			continue;
		}

		expression += escapeRegexCharacter(character);
	}

	return new RegExp(`${expression}$`);
}

function toDisplayPath(filePath: string): string {
	const relativePath = path.relative(process.cwd(), filePath);
	if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
		return filePath;
	}

	return relativePath.split(path.sep).join('/');
}

function matchesType(type: SearchType, isDirectory: boolean): boolean {
	if (type === 'any') {
		return true;
	}

	return type === 'directory' ? isDirectory : !isDirectory;
}

function matchesAnyPattern(value: string, patterns: RegExp[]): boolean {
	return patterns.some((pattern) => pattern.test(value));
}

async function collectMatches(options: {
	rootPath: string;
	currentPath: string;
	pattern: RegExp;
	excludePatterns: RegExp[];
	searchType: SearchType;
	maxDepth?: number;
	depth: number;
}): Promise<Array<{ filePath: string; mtimeMs: number }>> {
	const { rootPath, currentPath, pattern, excludePatterns, searchType, maxDepth, depth } = options;
	const entries = await fs.readdir(currentPath, { withFileTypes: true });
	const matches: Array<{ filePath: string; mtimeMs: number }> = [];

	for (const entry of entries) {
		if (entry.isSymbolicLink()) {
			continue;
		}

		if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) {
			continue;
		}

		const absolutePath = path.join(currentPath, entry.name);
		const relativePath = path.relative(rootPath, absolutePath).split(path.sep).join('/');
		const nextDepth = depth + 1;

		if (matchesAnyPattern(relativePath, excludePatterns)) {
			continue;
		}

		if (maxDepth !== undefined && depth > maxDepth) {
			continue;
		}

		if (pattern.test(relativePath) && matchesType(searchType, entry.isDirectory())) {
			const stats = await fs.stat(absolutePath);
			matches.push({ filePath: absolutePath, mtimeMs: stats.mtimeMs });
		}

		if (entry.isDirectory() && (maxDepth === undefined || nextDepth < maxDepth)) {
			matches.push(
				...(await collectMatches({
					rootPath,
					currentPath: absolutePath,
					pattern,
					excludePatterns,
					searchType,
					maxDepth,
					depth: nextDepth,
				})),
			);
		}
	}

	return matches;
}

export const globSearch = tool({
	description:
		'Fast file pattern matching tool that works across codebases. Supports glob patterns like "**/*.js" or "src/**/*.ts" and returns matching paths sorted by modification time.',
	inputSchema: z.object({
		pattern: z.string().describe('Glob pattern to match, e.g. "*.ts", "src/**/*.tsx"'),
		path: z
			.string()
			.optional()
			.describe('The directory to search in. If omitted, the current working directory is used.'),
		searchPath: z
			.string()
			.optional()
			.describe('Deprecated alias for path. The directory to search within.'),
		type: z
			.enum(['file', 'directory', 'any'])
			.optional()
			.describe('Filter results by type. Default: any'),
		maxDepth: z
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe('Maximum directory depth to search'),
		excludes: z
			.array(z.string())
			.optional()
			.describe('Glob patterns to exclude from the search.'),
		offset: z
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe('Number of matches to skip before returning results. Defaults to 0.'),
		limit: z
			.number()
			.int()
			.positive()
			.max(1000)
			.optional()
			.describe('Maximum number of results to return. Defaults to 100.'),
	}),
	execute: async ({ pattern, path: inputPath, searchPath, type = 'any', maxDepth, excludes = [], offset = 0, limit = DEFAULT_LIMIT }) => {
		const start = Date.now();
		try {
			const requestedPath = inputPath ?? searchPath;
			const resolved = requestedPath ? path.resolve(requestedPath) : process.cwd();
			const excludePatterns = excludes.map((value) => globToRegExp(value));
			let stats;

			try {
				stats = await fs.stat(resolved);
			} catch (error: any) {
				if (error?.code === 'ENOENT') {
					return {
						error: `Directory does not exist: ${requestedPath ?? resolved}. Current working directory: ${process.cwd()}.`,
					};
				}

				throw error;
			}

			if (!stats.isDirectory()) {
				return { error: `Path is not a directory: ${requestedPath ?? resolved}` };
			}

			const matches = await collectMatches({
				rootPath: resolved,
				currentPath: resolved,
				pattern: globToRegExp(pattern),
				excludePatterns,
				searchType: type,
				maxDepth,
				depth: 0,
			});

			matches.sort((left, right) => right.mtimeMs - left.mtimeMs);

			const pagedMatches = matches.slice(offset, offset + limit);
			const truncated = offset + pagedMatches.length < matches.length;
			const filenames = pagedMatches.map(match => toDisplayPath(match.filePath));

			return {
				pattern,
				path: resolved,
				searchPath: resolved,
				offset,
				limit,
				excludes,
				durationMs: Date.now() - start,
				numFiles: filenames.length,
				totalMatches: matches.length,
				filenames,
				resultCount: filenames.length,
				truncated,
				results: filenames,
			};
		} catch (error: any) {
			return { error: `Search failed: ${error.message}` };
		}
	},
});
