export const TOOL_SEARCH_TOOL_NAME = 'toolSearch';

/**
 * Renders the toolSearch tool description with detailed usage instructions.
 */
export function getToolSearchDescription(): string {
	return `Search the available tools by name, description, mode support, or interaction style to discover the right capability to use.

Usage:
- Use this tool when you need to find the right tool for a specific task
- The query parameter searches across tool names and descriptions
- Results are scored by relevance (exact matches score higher)
- Use includeInteractiveOnly to filter for tools that require user interaction
- Use includeReadOnlyOnly to filter for tools that are read-only (safe in any mode)
- Each result includes: name, description, readOnly flag, interactive flag, and allowedModes`;
}
