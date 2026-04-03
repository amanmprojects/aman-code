export const WRITE_FILE_TOOL_NAME = 'writeFile';

/**
 * Renders the writeFile tool description with detailed usage instructions.
 */
export function getWriteFileDescription(): string {
	return `Use this tool to create a new file or overwrite an existing file when explicitly allowed.

IMPORTANT: You MUST NEVER use this tool to modify or overwrite existing files. Always first confirm that the target file does not exist before calling this tool.

Usage:
- The file_path parameter must be an absolute path, not a relative path
- You MUST specify the full file_path including parent directories if needed
- If you want to create the file and any parent directories if they do not exist, use this tool - it will create directories automatically
- This tool is ideal when you need to create a new file from scratch
- For editing existing files, use the editFile tool instead
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- If the edit would be very large (>300 lines), break it up into multiple smaller edits. Your max output tokens is 64000 tokens per generation, so each of your edits MUST stay below this limit.
- Imports must always be at the top of the file. If you are making an edit, do not import libraries in your code block if it is not at the top of the file. Instead, make a second separate edit to add the imports. This is crucial since imports in the middle of a file is extremely poor code style.`;
}
