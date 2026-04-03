export const TODO_WRITE_TOOL_NAME = 'todoWrite';

/**
 * Renders the todoWrite tool description with detailed usage instructions.
 */
export function getTodoWriteDescription(): string {
	return `Create or update a structured todo list so the agent can track multi-step work with explicit status and priority fields.

Usage:
- Use this tool to create, update, or manage a todo list
- Each todo item has: id (unique identifier), content (task description), status (pending/in_progress/completed), and priority (high/medium/low)
- The todos parameter replaces the entire current todo list - include all items you want to keep
- Status values: 'pending' (not started), 'in_progress' (currently working on), 'completed' (done)
- Priority values: 'high' (urgent/important), 'medium' (normal), 'low' (can wait)
- Use this tool at the start of multi-step tasks to organize work and at milestones to update progress`;
}
