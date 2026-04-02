import { tool } from 'ai';
import { z } from 'zod';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

export const grepSearch = tool({
	description:
		'Search for a pattern (regex or fixed string) across files in a directory. Returns matching file paths and line numbers. Useful for finding where functions, variables, or strings are used.',
	inputSchema: z.object({
		pattern: z.string().describe('The search pattern (regex by default)'),
		searchPath: z
			.string()
			.describe('The directory or file path to search in'),
		includes: z
			.array(z.string())
			.optional()
			.describe(
				'Glob patterns to filter files, e.g. ["*.ts", "*.tsx"]',
			),
		fixedStrings: z
			.boolean()
			.optional()
			.describe(
				'If true, treat the pattern as a literal string instead of regex',
			),
		caseSensitive: z
			.boolean()
			.optional()
			.describe('If true, search is case-sensitive. Default: false (case-insensitive)'),
	}),
	execute: async ({pattern, searchPath, includes, fixedStrings, caseSensitive}) => {
		try {
			const resolved = path.resolve(searchPath);
			if (!fs.existsSync(resolved)) {
				return {error: `Path not found: ${resolved}`};
			}

			const args: string[] = ['grep', '-rn', '--color=never'];

			if (!caseSensitive) {
				args.push('-i');
			}

			if (fixedStrings) {
				args.push('-F');
			}

			if (includes && includes.length > 0) {
				for (const inc of includes) {
					args.push(`--include=${inc}`);
				}
			}

			// Exclude common noisy directories
			args.push('--exclude-dir=node_modules');
			args.push('--exclude-dir=.git');
			args.push('--exclude-dir=dist');

			args.push('--', pattern, resolved);

			const output = execSync(args.join(' '), {
				encoding: 'utf-8',
				maxBuffer: 1024 * 1024,
				timeout: 15_000,
				stdio: ['pipe', 'pipe', 'pipe'],
			});

			const lines = output.trim().split('\n').filter(Boolean);
			const capped = lines.slice(0, 50);

			return {
				pattern,
				searchPath: resolved,
				matchCount: lines.length,
				truncated: lines.length > 50,
				matches: capped.join('\n'),
			};
		} catch (error: any) {
			if (error.status === 1) {
				return {
					pattern,
					searchPath: path.resolve(searchPath),
					matchCount: 0,
					matches: '',
				};
			}

			return {error: `Search failed: ${error.message}`};
		}
	},
});
