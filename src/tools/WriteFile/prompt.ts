export const writeFileToolName = 'writeFile';

/**
 * Renders the writeFile tool description with detailed usage instructions.
 */
export function getWriteFileDescription(): string {
	return `Use this tool to create a new file from scratch. If you intentionally need to replace the full contents of an existing file, set overwrite: true; otherwise use the editFile tool for changes.

Usage:
- The filePath parameter must be an absolute path, not a relative path
- You MUST specify the full filePath including parent directories if needed
- If you want to create the file and any parent directories if they do not exist, use this tool - it will create directories automatically
- This tool is ideal when you need to create a new file from scratch
- For targeted edits to existing files, use the editFile tool instead
- Only set overwrite: true when you intend to replace the entire file contents in one operation
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.`;
}
