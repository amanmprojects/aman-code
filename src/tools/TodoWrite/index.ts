import {tool} from 'ai';
import {z} from 'zod';
import {getTodoWriteDescription} from './prompt.js';

const todoItemSchema = z.object({
	id: z.string().describe('Unique identifier for the todo item.'),
	content: z.string().describe('Human-readable task description.'),
	status: z.enum(['pending', 'in_progress', 'completed']),
	priority: z.enum(['high', 'medium', 'low']),
});

export const todoWrite = tool({
	description: getTodoWriteDescription(),
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
	async execute({todos}) {
		const todoList = new Map<string, z.infer<typeof todoItemSchema>>();
		for (const todo of todos) {
			todoList.set(todo.id, todo);
		}

		return {
			todos: [...todoList.values()],
			count: todoList.size,
		};
	},
});
