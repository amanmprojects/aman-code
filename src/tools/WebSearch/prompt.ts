export const WEB_SEARCH_TOOL_NAME = 'webSearch';

/**
 * Renders the webSearch tool description with detailed usage instructions.
 */
export function getWebSearchDescription(): string {
	return `Search the web for up-to-date information and return relevant results with snippets and source URLs.

Usage:
- Use this tool when you need current information that may not be in the training data
- The query parameter is the search query to look up
- Use searchDepth to control the search thoroughness: 'basic', 'advanced', 'fast', or 'ultra-fast'
- Use timeRange to filter results by recency: 'year', 'month', 'week', 'day' (or 'y', 'm', 'w', 'd')
- Returns search results with titles, URLs, snippets, and relevance scores
- Requires TAVILY_API_KEY to be set in the environment`;
}
