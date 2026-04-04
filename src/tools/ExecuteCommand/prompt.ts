export const executeCommandToolName = 'executeCommand';

export const defaultTimeoutMs = 10 * 60 * 1000; // 10 minutes
export const maxTimeoutMs = 30 * 60 * 1000; // 30 minutes
export const DEFAULT_TIMEOUT_MS = defaultTimeoutMs;

/**
 * Renders the executeCommand tool description with detailed usage instructions.
 */
export function getExecuteCommandDescription(): string {
	return `Executes a given shell command and returns its output.

IMPORTANT: Avoid using this tool to run file manipulation commands like cat, head, tail, find, grep, or echo. Instead, use the appropriate dedicated tool as this will provide a much better experience for the user:
- File search: Use globSearch (NOT find or ls)
- Content search: Use grepSearch (NOT grep or rg)
- Read files: Use readFile (NOT cat/head/tail)
- Edit files: Use editFile (NOT sed/awk)
- Write files: Use writeFile (NOT echo >/cat <<EOF)

While the executeCommand tool can do similar things, it's better to use the built-in tools as they provide a better user experience and make it easier to review tool calls and give permission.

Usage:
- The working directory persists between commands, but shell state does not. The shell environment is initialized from the user's profile (bash or zsh).
- If your command will create new directories or files, first use this tool to run ls to verify the parent directory exists and is the correct location.
- Always quote file paths that contain spaces with double quotes in your command (e.g., cd "path with spaces/file.txt")
- Try to maintain your current working directory throughout the session by using absolute paths and avoiding usage of cd. You may use cd if the User explicitly requests it.
- You may specify an optional timeout in milliseconds (up to ${maxTimeoutMs}ms / ${
		maxTimeoutMs / 60_000
	} minutes). By default, your command will timeout after ${defaultTimeoutMs}ms (${
		defaultTimeoutMs / 60_000
	} minutes).
- You can use the background parameter to run the command in the background and return immediately.
- When issuing multiple commands:
  - If the commands are independent and can run in parallel, make multiple executeCommand tool calls in a single message
  - If the commands depend on each other and must run sequentially, use a single executeCommand call with '&&' to chain them together
  - Use ';' only when you need to run commands sequentially but don't care if earlier commands fail
  - DO NOT use newlines to separate commands (newlines are ok in quoted strings)
- For git commands:
  - Prefer to create a new commit rather than amending an existing commit
  - Before running destructive operations (e.g., git reset --hard, git push --force, git checkout --), consider whether there is a safer alternative
  - Never skip hooks (--no-verify) or bypass signing unless the user has explicitly asked for it
- Avoid unnecessary sleep commands:
  - Do not sleep between commands that can run immediately — just run them
  - If your command is long running and you would like to be notified when it finishes — use background. No sleep needed.
  - Do not retry failing commands in a sleep loop — diagnose the root cause.`;
}
