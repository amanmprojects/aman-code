import {tool} from 'ai';
import {z} from 'zod';
import {getAskUserQuestionDescription} from './prompt.js';

const questionOptionSchema = z.object({
	id: z.string().describe('Stable identifier for this option.'),
	label: z.string().describe('Short option label displayed to the user.'),
	description: z
		.string()
		.optional()
		.describe('Optional longer explanation shown beneath the label.'),
});

export const askUserQuestion = tool({
	description: getAskUserQuestionDescription(),
	inputSchema: z.object({
		question: z.string().describe('The question to present to the user.'),
		options: z
			.array(questionOptionSchema)
			.min(1)
			.max(8)
			.describe('Available answer choices for the user.'),
		allowMultiple: z
			.boolean()
			.optional()
			.describe('Whether the user may choose more than one option. Defaults to false.'),
	}),
	outputSchema: z.object({
		selectedOptionIds: z.array(z.string()),
		selectedLabels: z.array(z.string()),
	}),
});
