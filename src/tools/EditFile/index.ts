import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {tool} from 'ai';
import {z} from 'zod';
import {createPatch} from 'diff';
import {isBlockedDevicePath, isUNCPath} from '../path-guards.js';
import {getEditFileDescription} from './prompt.js';

/**
 * Detects the line ending style used in the given text.
 *
 * @param content - Text to inspect for line endings
 * @returns `'\r\n'` if `content` contains CRLF sequences, `'\n'` otherwise
 */
function detectLineEnding(content: string): '\n' | '\r\n' {
	return content.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Normalize line endings in a string to the specified style.
 *
 * @param content - The input text whose line endings will be normalized
 * @param lineEnding - Target line ending, either `'\n'` or `'\r\n'`
 * @returns The input string with all line endings converted to the specified `lineEnding`
 */
function normalizeLineEndings(
	content: string,
	lineEnding: '\n' | '\r\n',
): string {
	const normalized = content.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
	return lineEnding === '\r\n'
		? normalized.replaceAll('\n', '\r\n')
		: normalized;
}

/**
 * Counts the number of non-overlapping literal occurrences of `search` in `content`.
 *
 * Uses a literal, case-sensitive search and advances past each match so occurrences that overlap are not counted. If `search` is an empty string, the function returns `0`.
 *
 * @param content - The string to search within.
 * @param search - The substring to count.
 * @returns The number of non-overlapping occurrences of `search` found in `content`.
 */
function countOccurrences(content: string, search: string): number {
	if (!search) {
		return 0;
	}

	let count = 0;
	let index = 0;

	while (true) {
		const nextIndex = content.indexOf(search, index);
		if (nextIndex === -1) {
			return count;
		}

		count += 1;
		index = nextIndex + search.length;
	}
}

export const editFile = tool({
	description: getEditFileDescription(),
	inputSchema: z.object({
		filePath: z
			.string()
			.describe('Absolute or relative path to the file to edit'),
		oldString: z
			.string()
			.describe(
				'The exact text to find and replace. Must be unique in the file.',
			),
		newString: z
			.string()
			.describe('The replacement text. Must be different from oldString.'),
		replaceAll: z
			.boolean()
			.optional()
			.describe(
				'If true, replace all occurrences of oldString. Default: false.',
			),
	}),
	async execute({filePath, oldString, newString, replaceAll = false}) {
		try {
			const resolved = path.resolve(filePath);

			if (isUNCPath(resolved)) {
				return {
					error: `Cannot edit UNC path: ${filePath}. Use a local path instead.`,
				};
			}

			if (await isBlockedDevicePath(resolved)) {
				return {
					error: `Cannot edit device file: ${filePath}. This file would block or produce infinite output.`,
				};
			}

			if (path.extname(resolved).toLowerCase() === '.ipynb') {
				return {
					error: `Notebook edits are not supported by editFile: ${resolved}. Use a dedicated notebook tool instead.`,
				};
			}

			let stat;
			try {
				stat = await fs.stat(resolved);
			} catch (error: unknown) {
				const errorRecord = error as {code?: string};
				if (errorRecord.code === 'ENOENT') {
					return {error: `File not found: ${resolved}`};
				}

				throw error instanceof Error ? error : new Error(String(error));
			}

			if (stat.isDirectory()) {
				return {error: `Path is a directory, not a file: ${resolved}`};
			}

			const original = await fs.readFile(resolved, 'utf8');

			if (oldString === newString) {
				return {
					error: 'oldString and newString are identical. No edit needed.',
				};
			}

			const lineEnding = detectLineEnding(original);
			const normalizedOldString = normalizeLineEndings(oldString, lineEnding);

			if (oldString.length === 0) {
				return {
					error:
						'oldString must not be empty. Provide the exact text to replace.',
				};
			}

			if (!original.includes(normalizedOldString)) {
				return {
					error:
						'oldString not found in file. Make sure it matches exactly, including whitespace, indentation, and line endings.',
				};
			}

			const occurrenceCount = countOccurrences(original, normalizedOldString);

			if (!replaceAll && occurrenceCount > 1) {
				return {
					error:
						'oldString appears multiple times in the file. Provide more context to make it unique, or set replaceAll: true.',
				};
			}

			const normalizedNewString = normalizeLineEndings(newString, lineEnding);

			const updated = replaceAll
				? original.split(normalizedOldString).join(normalizedNewString)
				: original.replace(normalizedOldString, normalizedNewString);

			await fs.writeFile(resolved, updated, 'utf8');

			const diff = createPatch(
				path.basename(resolved),
				original,
				updated,
				'original',
				'modified',
			);

			return {
				filePath: resolved,
				diff,
				replacedOccurrences: replaceAll ? occurrenceCount : 1,
			};
		} catch (error: any) {
			return {error: `Failed to edit file: ${error.message}`};
		}
	},
});
