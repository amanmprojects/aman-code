export const GREP_SEARCH_TOOL_NAME = 'grepSearch';

/**
 * Renders the grepSearch tool description with detailed usage instructions.
 */
export function getGrepSearchDescription(): string {
	return `A powerful search tool built on ripgrep

Usage:
- ALWAYS use grepSearch for search tasks. NEVER invoke \`grep\` or \`rg\` as an executeCommand command. The grepSearch tool has been optimized for correct permissions and access.
- Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")
- Filter files with includes parameter (e.g., "*.js", "**/*.tsx") or type parameter (e.g., "js", "py", "rust")
- Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts
- Use the Agent tool for open-ended searches requiring multiple rounds
- Pattern syntax: Uses ripgrep (not grep) - literal braces need escaping (use \`interface\\{\}\` to find \`interface{}\` in Go code)
- Multiline matching: By default patterns match within single lines only. For cross-line patterns, use \`multiline: true\`
- Use context, contextBefore, contextAfter to show lines around matches
- Results are sorted by modification time when using files_with_matches mode
- Supports case-sensitive and case-insensitive search
- Supports fixed string matching (treat pattern as literal instead of regex)`;
}