import { tool } from 'ai';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const writeFile = tool({
	description:
		'Create a new file or completely overwrite an existing file with the provided content. Use editFile for partial modifications instead.',
	inputSchema: z.object({
		filePath: z.string().describe('Absolute or relative path to the file to write'),
		content: z.string().describe('The full content to write to the file'),
	}),
	execute: async ({filePath, content}) => {
		try {
			const resolved = path.resolve(filePath);
			const dir = path.dirname(resolved);

			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, {recursive: true});
			}

			const existed = fs.existsSync(resolved);
			fs.writeFileSync(resolved, content, 'utf-8');

			const lines = content.split('\n').length;
			return {
				filePath: resolved,
				action: existed ? 'overwritten' : 'created',
				lines,
				bytes: Buffer.byteLength(content, 'utf-8'),
			};
		} catch (error: any) {
			return {error: `Failed to write file: ${error.message}`};
		}
	},
});
