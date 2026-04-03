import { tool } from 'ai';
import { z } from 'zod';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const writeFile = tool({
	description:
		'Create a new file or overwrite an existing file only when explicitly allowed. Use editFile for partial modifications instead.',
	inputSchema: z.object({
		filePath: z.string().describe('Absolute or relative path to the file to write'),
		content: z.string().describe('The full content to write to the file'),
		overwrite: z
			.boolean()
			.optional()
			.describe('If true, allow overwriting an existing file. Defaults to false.'),
	}),
	execute: async ({filePath, content, overwrite = false}) => {
		try {
			const resolved = path.resolve(filePath);
			const dir = path.dirname(resolved);
			let existed = false;

			await fs.mkdir(dir, {recursive: true});

			try {
				const existingStat = await fs.stat(resolved);
				if (existingStat.isDirectory()) {
					return {error: `Cannot write file because the path is a directory: ${resolved}`};
				}

				existed = true;
			} catch (error: any) {
				if (error?.code !== 'ENOENT') {
					throw error;
				}
			}

			if (existed && !overwrite) {
				return {
					error:
						`File already exists: ${resolved}. Re-run writeFile with overwrite: true to replace it, or use editFile for a targeted change.`,
				};
			}

			await fs.writeFile(resolved, content, 'utf-8');

			const lines = content.split('\n').length;
			return {
				filePath: resolved,
				action: existed ? 'overwritten' : 'created',
				overwrite,
				lines,
				bytes: Buffer.byteLength(content, 'utf-8'),
			};
		} catch (error: any) {
			return {error: `Failed to write file: ${error.message}`};
		}
	},
});
