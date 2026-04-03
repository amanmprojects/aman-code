import {tool} from 'ai';
import {tavilySearch} from '@tavily/ai-sdk';
import {z} from 'zod';
import {getWebSearchDescription} from './prompt.js';

const tavilyTool = tavilySearch();

export const webSearch = tool({
	description: getWebSearchDescription(),
	inputSchema: z.object({
		query: z.string().describe('The search query to look up on the web.'),
		searchDepth: z
			.enum(['basic', 'advanced', 'fast', 'ultra-fast'])
			.optional()
			.describe("The search depth to use. Defaults to Tavily's default."),
		timeRange: z
			.enum(['year', 'month', 'week', 'day', 'y', 'm', 'w', 'd'])
			.optional()
			.describe('Optional recency filter for web results.'),
	}),
	execute: async (input, options) => {
		if (!process.env['TAVILY_API_KEY']) {
			return {
				error:
					'TAVILY_API_KEY is not set. Configure the Tavily API key in the environment before using webSearch.',
			};
		}

		const execute = tavilyTool.execute;
		if (execute == null) {
			return {
				error: 'Tavily search tool is unavailable in the current installation.',
			};
		}

		try {
			return await execute(input, options);
		} catch (error: any) {
			return {
				error: `Web search failed: ${error.message}`,
			};
		}
	},
});
