export const LIST_DIR_TOOL_NAME = 'listDir';

/**
 * Renders the listDir tool description with detailed usage instructions.
 */
export function getListDirDescription(): string {
	return `List the files and directories inside a directory, including lightweight metadata like entry type and size.

Usage:
- The path parameter must be an absolute path, not a relative path
- Returns entries with their name, path, type (file/directory/symlink/other), size (for files), and children count (for directories)
- Results are sorted alphabetically by name
- Use includeHidden to include dotfiles and dot-directories (defaults to false)
- Results are paginated with the limit parameter (defaults to 200, max 1000)
- The truncated flag indicates if there were more entries than the limit
- The totalCount field shows the total number of entries before pagination`;
}