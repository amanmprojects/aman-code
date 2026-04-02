import { tool } from 'ai';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createPatch } from 'diff';

export const editFile = tool({
	description:
		'Make a targeted edit to a file by replacing an exact string match with new content. The old_string must match exactly (including whitespace and indentation). For creating new files, use writeFile instead.',
	inputSchema: z.object({
		filePath: z.string().describe('Absolute or relative path to the file to edit'),
		oldString: z
			.string()
			.describe('The exact text to find and replace. Must be unique in the file.'),
		newString: z
			.string()
			.describe('The replacement text. Must be different from oldString.'),
		replaceAll: z
			.boolean()
			.optional()
			.describe('If true, replace all occurrences of oldString. Default: false.'),
	}),
	execute: async ({filePath, oldString, newString, replaceAll}) => {
		try {
			const resolved = path.resolve(filePath);
			if (!fs.existsSync(resolved)) {
				return {error: `File not found: ${resolved}`};
			}

			const original = fs.readFileSync(resolved, 'utf-8');

			if (oldString === newString) {
				return {error: 'oldString and newString are identical. No edit needed.'};
			}

			if (!original.includes(oldString)) {
				return {
					error: `oldString not found in file. Make sure it matches exactly (including whitespace).`,
				};
			}

			if (!replaceAll) {
				const firstIdx = original.indexOf(oldString);
				const secondIdx = original.indexOf(oldString, firstIdx + 1);
				if (secondIdx !== -1) {
					return {
						error:
							'oldString appears multiple times in the file. Provide more context to make it unique, or set replaceAll: true.',
					};
				}
			}

			const updated = replaceAll
				? original.split(oldString).join(newString)
				: original.replace(oldString, newString);

			fs.writeFileSync(resolved, updated, 'utf-8');

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
			};
		} catch (error: any) {
			return {error: `Failed to edit file: ${error.message}`};
		}
	},
});
