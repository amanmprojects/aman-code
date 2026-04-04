export const editFileToolName = 'editFile';

/**
 * Renders the editFile tool description with detailed usage instructions.
 */
export function getEditFileDescription(): string {
	return `Performs exact string replacements in files.

Usage:
- You must use your readFile tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file.
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: spaces + line number + tab. Everything after that tab is the actual file content to match. Never include any part of the line number prefix in the oldString or newString.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if oldString is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use replaceAll to change every instance of oldString.
- Use replaceAll for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.
- CRITICAL REQUIREMENTS:
  1. All edits follow the same requirements as the single Edit tool
  2. The edits are atomic - either all succeed or none are applied
  3. Plan your edits carefully to avoid conflicts between sequential operations
  4. Warning: Since edits are applied in sequence, ensure that earlier edits don't affect the text that later edits are trying to find
- If you want to create a new file, use: 
  - A new file path, including dir name if needed
  - First edit: empty oldString and the new file's contents as newString
  - Subsequent edits: normal edit operations on the created content`;
}
