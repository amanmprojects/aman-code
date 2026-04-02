import { tool } from 'ai';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const readFile = tool({
	description:
		'Read the contents of a file at the specified path. Returns the file contents with line numbers. Use this to understand existing code before making changes.',
	inputSchema: z.object({
		filePath: z.string().describe('Absolute or relative path to the file to read'),
		offset: z
			.number()
			.optional()
			.describe('1-indexed line number to start reading from'),
		limit: z
			.number()
			.optional()
			.describe('Number of lines to read from the offset'),
	}),
	execute: async ({filePath, offset, limit}) => {
		try {
			const resolved = path.resolve(filePath);
			if (!fs.existsSync(resolved)) {
				return {error: `File not found: ${resolved}`};
			}

			const stat = fs.statSync(resolved);
			if (stat.isDirectory()) {
				return {error: `Path is a directory, not a file: ${resolved}`};
			}

			const content = fs.readFileSync(resolved, 'utf-8');
			const lines = content.split('\n');
			const totalLines = lines.length;

			let startLine = 1;
			let endLine = totalLines;

			if (offset !== undefined) {
				startLine = Math.max(1, offset);
				if (limit !== undefined) {
					endLine = Math.min(totalLines, startLine + limit - 1);
				}
			}

			const selectedLines = lines.slice(startLine - 1, endLine);
			const numbered = selectedLines
				.map((line, i) => `${String(startLine + i).padStart(6, ' ')}│ ${line}`)
				.join('\n');

			return {
				filePath: resolved,
				totalLines,
				startLine,
				endLine,
				content: numbered,
			};
		} catch (error: any) {
			return {error: `Failed to read file: ${error.message}`};
		}
	},
});
