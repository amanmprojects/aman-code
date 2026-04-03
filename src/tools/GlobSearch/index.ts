import {tool} from 'ai';
import {z} from 'zod';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import {isBlockedDevicePath, isUNCPath} from '../pathGuards.js';
import {getGlobSearchDescription} from './prompt.js';

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
				const isSegmentGlob =
					followingCharacter === '/' &&
					(index === 0 || previousCharacter === '/');

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
	if (
		!relativePath ||
		relativePath.startsWith('..') ||
		path.isAbsolute(relativePath)
	) {
		return filePath;
	}

	return relativePath.split(path.sep).join('/');
}

/**
 * Determines whether an item matches the requested search type.
 *
 * @param type - The desired search type: 'file', 'directory', or 'any'
 * @param isDirectory - \`true\` if the item is a directory, \`false\` if it is a file
 * @returns \`true\` if the item matches \`type\` (\`true\` for 'any'; for 'directory' when \`isDirectory\` is \`true\`; for 'file' when \`isDirectory\` is \`false\`), \`false\` otherwise
 */
function matchesType(type: SearchType, isDirectory: boolean): boolean {
	if (type === 'any') {
		return true;
	}

	return type === 'directory' ? isDirectory : !isDirectory;
}

/**
 * Checks whether a string matches at least one regular expression from a list.
 *
 * @param value - The string to test against the patterns
 * @param patterns - Array of \`RegExp\` objects to test \`value\` against
 * @returns \`true\` if any pattern matches \`value\`, \`false\` otherwise
 */
function matchesAnyPattern(value: string, patterns: RegExp[]): boolean {
	return patterns.some(pattern => pattern.test(value));
}

/**
 * Recursively collects filesystem entries under \`currentPath\` whose paths (relative to \`rootPath\`) match \`pattern\` and \`searchType\`, returning each match with its modification time.
 *
 * Skips symbolic links and directories named in \`EXCLUDED_DIRECTORIES\`. Paths are compared against \`excludePatterns\` using the relative path from \`rootPath\` with forward-slash separators. When \`maxDepth\` is provided, it is inclusive relative to \`rootPath\`: \`0\` searches only direct children of \`rootPath\`, \`1\` includes one nested directory level, and so on.
 *
 * @param options.rootPath - Base directory used to compute relative paths for matching and exclusions
 * @param options.currentPath - Directory to search in this call (may be a nested directory during recursion)
 * @param options.pattern - Regex that candidate relative paths must match to be included
 * @param options.excludePatterns - Regexes that, if any match a relative path, cause that entry (and its subtree) to be skipped
 * @param options.searchType - Controls whether to include files, directories, or both
 * @param options.maxDepth - Optional maximum recursion depth relative to \`rootPath\`; inclusive, with \`0\` meaning direct children only
 * @param options.depth - Current recursion depth; 0 corresponds to \`rootPath\`
 * @returns An array of objects each containing \`filePath\` (absolute path to the match) and \`mtimeMs\` (its modification time in milliseconds)
 */
async function collectMatches(options: {
	rootPath: string;
	currentPath: string;
	pattern: RegExp;
	excludePatterns: RegExp[];
	searchType: SearchType;
	maxDepth?: number;
	depth: number;
	stopAfter?: number;
}): Promise<Array<{filePath: string; mtimeMs: number}>> {
	const {
		rootPath,
		currentPath,
		pattern,
		excludePatterns,
		searchType,
		maxDepth,
		depth,
		stopAfter,
	} = options;

	if (maxDepth !== undefined && depth > maxDepth) {
		return [];
	}

	const entries = await fs.readdir(currentPath, {withFileTypes: true});
	const matches: Array<{filePath: string; mtimeMs: number}> = [];

	for (const entry of entries) {
		if (entry.isSymbolicLink()) {
			continue;
		}

		if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) {
			continue;
		}

		const absolutePath = path.join(currentPath, entry.name);
		const relativePath = path
			.relative(rootPath, absolutePath)
			.split(path.sep)
			.join('/');
		const nextDepth = depth + 1;

		if (matchesAnyPattern(relativePath, excludePatterns)) {
			continue;
		}

		if (
			pattern.test(relativePath) &&
			matchesType(searchType, entry.isDirectory())
		) {
			const stats = await fs.stat(absolutePath);
			matches.push({filePath: absolutePath, mtimeMs: stats.mtimeMs});

			if (stopAfter !== undefined && matches.length >= stopAfter) {
				return matches;
			}
		}

		if (
			entry.isDirectory() &&
			(maxDepth === undefined || nextDepth <= maxDepth)
		) {
			const nestedMatches = await collectMatches({
				rootPath,
				currentPath: absolutePath,
				pattern,
				excludePatterns,
				searchType,
				maxDepth,
				depth: nextDepth,
				stopAfter:
					stopAfter === undefined ? undefined : stopAfter - matches.length,
			});
			matches.push(...nestedMatches);

			if (stopAfter !== undefined && matches.length >= stopAfter) {
				return matches;
			}
		}
	}

	return matches;
}

export const globSearch = tool({
	description: getGlobSearchDescription(),
	inputSchema: z.object({
		pattern: z
			.string()
			.describe('Glob pattern to match, e.g. "*.ts", "src/**/*.tsx"'),
		path: z
			.string()
			.optional()
			.describe(
				'The directory to search in. If omitted, the current working directory is used.',
			),
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
			.describe(
				'Maximum directory depth relative to the search root. 0 searches direct children only, 1 includes one nested level, and so on.',
			),
		excludes: z
			.array(z.string())
			.optional()
			.describe('Glob patterns to exclude from the search.'),
		offset: z
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe(
				'Number of matches to skip before returning results. Defaults to 0.',
			),
		limit: z
			.number()
			.int()
			.positive()
			.max(1000)
			.optional()
			.describe('Maximum number of results to return. Defaults to 100.'),
		includeTotalMatches: z
			.boolean()
			.optional()
			.describe(
				'If true, scan the full tree and return totalMatches. Default: false.',
			),
	}),
	execute: async ({
		pattern,
		path: inputPath,
		searchPath,
		type = 'any',
		maxDepth,
		excludes = [],
		offset = 0,
		limit = DEFAULT_LIMIT,
		includeTotalMatches = false,
	}) => {
		const start = Date.now();
		try {
			const requestedPath = inputPath ?? searchPath;
			const resolved = requestedPath
				? path.resolve(requestedPath)
				: process.cwd();

			if ((requestedPath && isUNCPath(requestedPath)) || isUNCPath(resolved)) {
				return {
					error: `Cannot search UNC path: ${
						requestedPath ?? resolved
					}. Use a local path instead.`,
				};
			}

			if (
				(requestedPath && isBlockedDevicePath(requestedPath)) ||
				isBlockedDevicePath(resolved)
			) {
				return {
					error: `Cannot search device path: ${
						requestedPath ?? resolved
					}. This path would block or produce infinite output.`,
				};
			}
			const excludePatterns = excludes.map(value => globToRegExp(value));
			let stats;

			try {
				stats = await fs.stat(resolved);
			} catch (error: any) {
				if (error?.code === 'ENOENT') {
					return {
						error: `Directory does not exist: ${
							requestedPath ?? resolved
						}. Current working directory: ${process.cwd()}.`,
					};
				}

				throw error;
			}

			if (!stats.isDirectory()) {
				return {error: `Path is not a directory: ${requestedPath ?? resolved}`};
			}

			const matches = await collectMatches({
				rootPath: resolved,
				currentPath: resolved,
				pattern: globToRegExp(pattern),
				excludePatterns,
				searchType: type,
				maxDepth,
				depth: 0,
				...(includeTotalMatches ? {} : {stopAfter: offset + limit}),
			});

			matches.sort((left, right) => right.mtimeMs - left.mtimeMs);

			const pagedMatches = matches.slice(offset, offset + limit);
			const truncated = includeTotalMatches
				? offset + pagedMatches.length < matches.length
				: matches.length >= offset + limit;
			const filenames = pagedMatches.map(match =>
				toDisplayPath(match.filePath),
			);

			return {
				pattern,
				path: resolved,
				searchPath: resolved,
				offset,
				limit,
				includeTotalMatches,
				excludes,
				durationMs: Date.now() - start,
				numFiles: filenames.length,
				...(includeTotalMatches ? {totalMatches: matches.length} : {}),
				filenames,
				resultCount: filenames.length,
				truncated,
				results: filenames,
			};
		} catch (error: any) {
			return {error: `Search failed: ${error.message}`};
		}
	},
});
