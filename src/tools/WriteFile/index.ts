import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {tool} from 'ai';
import {z} from 'zod';
import {isBlockedDevicePath, isUNCPath} from '../path-guards.js';
import {getWriteFileDescription} from './prompt.js';

export const writeFile = tool({
	description: getWriteFileDescription(),
	inputSchema: z.object({
		filePath: z
			.string()
			.describe('Absolute or relative path to the file to write'),
		content: z.string().describe('The full content to write to the file'),
		overwrite: z
			.boolean()
			.optional()
			.describe(
				'If true, allow overwriting an existing file. Defaults to false.',
			),
	}),
	async execute({filePath, content, overwrite = false}) {
		try {
			const resolved = path.resolve(filePath);
			const dir = path.dirname(resolved);

			if (isUNCPath(resolved)) {
				return {
					error: `Cannot write UNC path: ${filePath}. Use a local path instead.`,
				};
			}

			if (isBlockedDevicePath(resolved)) {
				return {
					error: `Cannot write device file: ${filePath}. This file would block or produce infinite output.`,
				};
			}

			await fs.mkdir(dir, {recursive: true});

			try {
				await fs.writeFile(resolved, content, {
					encoding: 'utf-8',
					flag: overwrite ? 'w' : 'wx',
				});
			} catch (error: any) {
				if (error?.code === 'EEXIST') {
					return {
						error: `File already exists: ${resolved}. Re-run writeFile with overwrite: true to replace it, or use editFile for a targeted change.`,
					};
				}

				if (error?.code === 'EISDIR') {
					return {
						error: `Cannot write file because the path is a directory: ${resolved}`,
					};
				}

				throw error;
			}

			const lines = content.split('\n').length;
			return {
				filePath: resolved,
				action: overwrite ? 'written' : 'created',
				overwrite,
				lines,
				bytes: Buffer.byteLength(content, 'utf-8'),
			};
		} catch (error: any) {
			return {error: `Failed to write file: ${error.message}`};
		}
	},
});
