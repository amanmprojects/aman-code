import { tool } from 'ai';
import { z } from 'zod';
import { allToolNames, getToolMetadata, type ToolName } from './toolMetadata.js';

function tokenize(value: string): string[] {
	return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function scoreTool(name: ToolName, query: string): number {
	const metadata = getToolMetadata(name);
	if (metadata == null) {
		return 0;
	}

	const lowerQuery = query.trim().toLowerCase();
	if (!lowerQuery) {
		return 1;
	}

	const haystack = `${name} ${metadata.description}`.toLowerCase();
	if (haystack.includes(lowerQuery)) {
		return 100;
	}

	const queryTokens = tokenize(lowerQuery);
	const haystackTokens = new Set(tokenize(haystack));
	let score = 0;

	for (const token of queryTokens) {
		if (haystackTokens.has(token)) {
			score += 10;
		} else if (Array.from(haystackTokens).some((candidate) => candidate.startsWith(token))) {
			score += 3;
		}
	}

	return score;
}

export const toolSearch = tool({
	description:
		'Search the available tools by name, description, mode support, or interaction style to discover the right capability to use.',
	inputSchema: z.object({
		query: z
			.string()
			.optional()
			.describe('The search query to match against tool names and descriptions.'),
		includeInteractiveOnly: z
			.boolean()
			.optional()
			.describe('If true, only return tools that require user interaction.'),
		includeReadOnlyOnly: z
			.boolean()
			.optional()
			.describe('If true, only return tools that are read-only.'),
	}),
	execute: async ({ query = '', includeInteractiveOnly = false, includeReadOnlyOnly = false }) => {
		const results = allToolNames
			.map((name) => {
				const metadata = getToolMetadata(name);
				if (metadata == null) {
					return null;
				}

				if (includeInteractiveOnly && metadata.interactive !== true) {
					return null;
				}

				if (includeReadOnlyOnly && metadata.readOnly !== true) {
					return null;
				}

				return {
					name,
					description: metadata.description,
					readOnly: metadata.readOnly,
					interactive: metadata.interactive === true,
					allowedModes: metadata.allowedModes,
					score: scoreTool(name, query),
				};
			})
			.filter((value): value is NonNullable<typeof value> => value != null)
			.filter((value) => query.trim().length === 0 || value.score > 0)
			.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));

		return {
			query,
			count: results.length,
			results,
		};
	},
});
