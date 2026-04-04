import {tool} from 'ai';
import {z} from 'zod';
import {allToolNames, getToolMetadata, type ToolName} from '../toolMetadata.js';
import {getToolSearchDescription} from './prompt.js';

/**
 * Converts the input string into lowercase alphanumeric tokens.
 *
 * @param value - The input string to tokenize.
 * @returns An array of lowercase tokens consisting of contiguous letters and digits; empty tokens are omitted.
 */
function tokenize(value: string): string[] {
	return value
		.toLowerCase()
		.split(/[^a-z\d]+/)
		.filter(Boolean);
}

/**
 * Compute a relevance score for a tool given a search query.
 *
 * @param name - The tool's identifier
 * @param query - The search text to match against the tool's name and description
 * @returns A numeric relevance score: \`0\` if metadata is missing, \`1\` if \`query\` is empty after trimming, \`100\` if the query appears as a full substring of the tool's name+description, otherwise a positive integer derived from token matches (higher is more relevant)
 */
function scoreTool(name: ToolName, query: string): number {
	const metadata = getToolMetadata(name);
	if (metadata == null) {
		return 0;
	}

	const lowerQuery = query.trim().toLowerCase();
	if (!lowerQuery) {
		return 1;
	}

	const metadataFacets = [
		metadata.description,
		metadata.allowedModes.join(' '),
		...(metadata.interactive === true ? ['interactive'] : []),
		...(metadata.readOnly ? ['read-only', 'readonly'] : []),
	];
	const haystack = `${name} ${metadataFacets.join(' ')}`.toLowerCase();
	if (haystack.includes(lowerQuery)) {
		return 100;
	}

	const queryTokens = tokenize(lowerQuery);
	const haystackTokens = new Set(tokenize(haystack));
	const haystackArray = [...haystackTokens];
	let score = 0;

	for (const token of queryTokens) {
		if (haystackTokens.has(token)) {
			score += 10;
		} else if (haystackArray.some(candidate => candidate.startsWith(token))) {
			score += 3;
		}
	}

	return score;
}

export const toolSearch = tool({
	description: getToolSearchDescription(),
	inputSchema: z.object({
		query: z
			.string()
			.optional()
			.describe(
				'The search query to match against tool names and descriptions.',
			),
		includeInteractiveOnly: z
			.boolean()
			.optional()
			.describe('If true, only return tools that require user interaction.'),
		includeReadOnlyOnly: z
			.boolean()
			.optional()
			.describe('If true, only return tools that are read-only.'),
	}),
	async execute({
		query = '',
		includeInteractiveOnly = false,
		includeReadOnlyOnly = false,
	}) {
		const results = allToolNames
			.map(name => {
				const metadata = getToolMetadata(name);
				if (metadata == null) {
					return null;
				}

				if (includeInteractiveOnly && metadata.interactive !== true) {
					return null;
				}

				if (includeReadOnlyOnly && !metadata.readOnly) {
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
			.filter(value => query.trim().length === 0 || value.score > 0)
			.sort(
				(left, right) =>
					right.score - left.score || left.name.localeCompare(right.name),
			);

		return {
			query,
			count: results.length,
			results,
		};
	},
});
