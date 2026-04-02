import { tool } from 'ai';
import { z } from 'zod';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

export const globSearch = tool({
	description:
		'Find files and directories matching a glob pattern. Use this to discover project structure and locate files before reading them.',
	inputSchema: z.object({
		pattern: z.string().describe('Glob pattern to match, e.g. "*.ts", "src/**/*.tsx"'),
		searchPath: z
			.string()
			.describe('The directory to search within'),
		type: z
			.enum(['file', 'directory', 'any'])
			.optional()
			.describe('Filter results by type. Default: any'),
		maxDepth: z
			.number()
			.optional()
			.describe('Maximum directory depth to search'),
	}),
	execute: async ({pattern, searchPath, type, maxDepth}) => {
		try {
			const resolved = path.resolve(searchPath);
			if (!fs.existsSync(resolved)) {
				return {error: `Path not found: ${resolved}`};
			}

			// Try using `find` command for glob matching
			const args: string[] = ['find', resolved];

			if (maxDepth !== undefined) {
				args.push('-maxdepth', String(maxDepth));
			}

			// Exclude common directories
			args.push('(', '-name', 'node_modules', '-o', '-name', '.git', '-o', '-name', 'dist', ')', '-prune', '-o');

			if (type === 'file') {
				args.push('-type', 'f');
			} else if (type === 'directory') {
				args.push('-type', 'd');
			}

			args.push('-name', pattern, '-print');

			const output = execSync(args.join(' '), {
				encoding: 'utf-8',
				maxBuffer: 1024 * 1024,
				timeout: 15_000,
				stdio: ['pipe', 'pipe', 'pipe'],
			});

			const results = output.trim().split('\n').filter(Boolean);
			const capped = results.slice(0, 50);

			return {
				pattern,
				searchPath: resolved,
				resultCount: results.length,
				truncated: results.length > 50,
				results: capped,
			};
		} catch (error: any) {
			return {error: `Search failed: ${error.message}`};
		}
	},
});
