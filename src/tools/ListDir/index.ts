import {tool} from 'ai';
import {z} from 'zod';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {isBlockedDevicePath, isUNCPath} from '../pathGuards.js';
import {getListDirDescription} from './prompt.js';

const DEFAULT_LIMIT = 200;

type EntryType = 'file' | 'directory' | 'symlink' | 'other';

type DirectoryEntryResult = {
	name: string;
	path: string;
	type: EntryType;
	size: number | null;
	children: number | null;
};

const ENTRY_PROCESSING_CONCURRENCY = 10;

/**
 * Produce a display-friendly path: use a path relative to the current working directory with POSIX (`/`) separators when `targetPath` is inside the cwd; otherwise return `targetPath` unchanged.
 *
 * @param targetPath - The filesystem path to convert for display
 * @returns A POSIX-style path relative to `process.cwd()` when `targetPath` is inside it, otherwise the original `targetPath`
 */
function toDisplayPath(targetPath: string): string {
	const relativePath = path.relative(process.cwd(), targetPath);
	if (
		!relativePath ||
		relativePath.startsWith('..') ||
		path.isAbsolute(relativePath)
	) {
		return targetPath;
	}

	return relativePath.split(path.sep).join('/');
}

/**
 * Counts immediate entries (files, directories, symlinks, etc.) within a directory.
 *
 * @param directoryPath - Filesystem path of the directory to inspect
 * @returns The number of immediate entries inside `directoryPath`
 */
async function countChildren(directoryPath: string): Promise<number> {
	const entries = await fs.readdir(directoryPath);
	return entries.length;
}

/**
 * Classifies a file system entry represented by an fs.Stats-like object.
 *
 * @param stat - The object returned by `fs.lstat` for the entry.
 * @returns The entry type: `file`, `directory`, `symlink`, or `other`.
 */
function getEntryType(stat: Awaited<ReturnType<typeof fs.lstat>>): EntryType {
	if (stat.isFile()) {
		return 'file';
	}

	if (stat.isDirectory()) {
		return 'directory';
	}

	if (stat.isSymbolicLink()) {
		return 'symlink';
	}

	return 'other';
}

async function mapWithConcurrency<T, U>(
	items: T[],
	concurrency: number,
	mapper: (item: T) => Promise<U>,
): Promise<U[]> {
	const results = new Array<U>(items.length);
	let nextIndex = 0;

	async function worker(): Promise<void> {
		while (true) {
			const currentIndex = nextIndex;
			nextIndex += 1;

			if (currentIndex >= items.length) {
				return;
			}

			results[currentIndex] = await mapper(items[currentIndex]!);
		}
	}

	await Promise.all(
		Array.from({length: Math.min(concurrency, items.length)}, async () =>
			worker(),
		),
	);

	return results;
}

export const listDir = tool({
	description: getListDirDescription(),
	inputSchema: z.object({
		path: z
			.string()
			.optional()
			.describe(
				'The directory to list. Defaults to the current working directory.',
			),
		includeHidden: z
			.boolean()
			.optional()
			.describe(
				'Whether to include dotfiles and dot-directories. Defaults to false.',
			),
		limit: z
			.number()
			.int()
			.positive()
			.max(1000)
			.optional()
			.describe(
				'Maximum number of directory entries to return. Defaults to 200.',
			),
	}),
	execute: async ({
		path: inputPath,
		includeHidden = false,
		limit = DEFAULT_LIMIT,
	}) => {
		try {
			const resolvedPath = inputPath ? path.resolve(inputPath) : process.cwd();

			if (isUNCPath(resolvedPath)) {
				return {
					error: `Cannot list UNC path: ${
						inputPath ?? resolvedPath
					}. Use a local path instead.`,
				};
			}

			if (isBlockedDevicePath(resolvedPath)) {
				return {
					error: `Cannot list device path: ${
						inputPath ?? resolvedPath
					}. This path would block or produce infinite output.`,
				};
			}
			const stat = await fs.stat(resolvedPath);

			if (!stat.isDirectory()) {
				return {
					error: `Path is not a directory: ${inputPath ?? resolvedPath}`,
				};
			}

			const entries = await fs.readdir(resolvedPath, {withFileTypes: true});
			const visibleEntries = entries.filter(
				entry => includeHidden || !entry.name.startsWith('.'),
			);
			const sortedEntries = visibleEntries.sort((left, right) =>
				left.name.localeCompare(right.name),
			);
			const selectedEntries = sortedEntries.slice(0, limit);

			const results = await mapWithConcurrency(
				selectedEntries,
				ENTRY_PROCESSING_CONCURRENCY,
				async (entry): Promise<DirectoryEntryResult> => {
					const absoluteEntryPath = path.join(resolvedPath, entry.name);

					try {
						const entryStat = await fs.lstat(absoluteEntryPath);
						const type = getEntryType(entryStat);

						return {
							name: entry.name,
							path: toDisplayPath(absoluteEntryPath),
							type,
							size: type === 'file' ? entryStat.size : null,
							children:
								type === 'directory'
									? await countChildren(absoluteEntryPath)
									: null,
						};
					} catch {
						return {
							name: entry.name,
							path: toDisplayPath(absoluteEntryPath),
							type: 'other',
							size: null,
							children: null,
						};
					}
				},
			);

			return {
				path: resolvedPath,
				entries: results,
				count: results.length,
				totalCount: sortedEntries.length,
				truncated: sortedEntries.length > results.length,
			};
		} catch (error: any) {
			if (error?.code === 'ENOENT') {
				return {
					error: `Directory does not exist: ${inputPath ?? process.cwd()}`,
				};
			}

			const message =
				typeof error?.message === 'string' ? error.message : String(error);
			return {
				error: `Failed to list directory: ${message}`,
			};
		}
	},
});