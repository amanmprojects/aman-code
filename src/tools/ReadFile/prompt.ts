export const READ_FILE_TOOL_NAME = 'readFile';

export const FILE_UNCHANGED_STUB =
	'File unchanged since last read. The content from the earlier readFile tool result in this conversation is still current — refer to that instead of re-reading.';

export const MAX_LINES_TO_READ = 2000;

/**
 * Renders the readFile tool description with detailed usage instructions.
 */
export function getReadFileDescription(): string {
	return `Reads a file from the local filesystem. You can access any file directly by using this tool.

Assume this tool is able to read all files on the machine. If the User provides a path to a file assume that path is valid. It is okay to read a file that does not exist; an error will be returned.

Usage:
- The file_path parameter must be an absolute path, not a relative path
- By default, it reads up to ${MAX_LINES_TO_READ} lines starting from the beginning of the file
- You can optionally specify a line offset and limit (especially handy for long files), but it's recommended to read the whole file by not providing these parameters
- Results are returned using cat -n format, with line numbers starting at 1
- This tool allows the agent to read images (eg PNG, JPG, etc). When reading an image file the contents are presented visually as the agent is a multimodal LLM.
- This tool can read Jupyter notebooks (.ipynb files) and returns all cells with their outputs, combining code, text, and visualizations.
- This tool can only read files, not directories. To read a directory, use the listDir tool.
- You will regularly be asked to read screenshots. If the user provides a path to a screenshot, ALWAYS use this tool to view the file at the path. This tool will work with all temporary file paths.
- If you read a file that exists but has empty contents you will receive a system reminder warning in place of file contents.`;
}
