import {tool} from 'ai';
import {z} from 'zod';

const todoItemSchema = z.object({
	id: z.string().describe('Unique identifier for the todo item.'),
	content: z.string().describe('Human-readable task description.'),
	status: z.enum(['pending', 'in_progress', 'completed']),
	priority: z.enum(['high', 'medium', 'low']),
});

export const todoWrite = tool({
	description:
		'Create or update a structured todo list so the agent can track multi-step work with explicit status and priority fields.',
	inputSchema: z.object({
		todos: z
			.array(todoItemSchema)
			.describe(
				'The full list of todo items that should become the current task list.',
			),
	}),
	outputSchema: z.object({
		todos: z.array(todoItemSchema),
		count: z.number(),
	}),
	execute: async ({todos}) => {
		const todoList = new Map<string, z.infer<typeof todoItemSchema>>();
		todoList.clear();
		for (const todo of todos) {
			todoList.set(todo.id, todo);
		}

		return {
			todos: Array.from(todoList.values()),
			count: todoList.size,
		};
	},
});
