export const GLOB_SEARCH_TOOL_NAME = 'globSearch';

/**
 * Renders the globSearch tool description with detailed usage instructions.
 */
export function getGlobSearchDescription(): string {
	return `Fast file pattern matching tool that works with any codebase size

- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead

Usage:
- The path parameter must be an absolute path, not a relative path (though the results will show relative paths when appropriate)
- Supports glob patterns with * and ** wildcards
- Results are sorted by modification time (most recently modified first)
- Use type parameter to filter for 'file', 'directory', or 'any'
- Use excludes parameter to provide glob patterns to exclude from the search
- Use maxDepth parameter to limit recursion depth (0 = direct children only)
- Results are paginated with offset and limit parameters`;
}
