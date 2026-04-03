import { tool } from 'ai';
import { z } from 'zod';

export const exitPlanMode = tool({
	description:
		'Ask the user to confirm leaving plan mode and beginning implementation work.',
	inputSchema: z.object({
		planSummary: z
			.string()
			.optional()
			.describe('Short summary of the plan or next implementation step.'),
		targetMode: z
			.enum(['code', 'yolo'])
			.optional()
			.describe('The mode to switch to if the user approves. Defaults to code.'),
	}),
	outputSchema: z.object({
		approved: z.literal(true),
		targetMode: z.enum(['code', 'yolo']),
		message: z.string(),
	}),
	needsApproval: true,
	execute: async ({ planSummary, targetMode = 'code' }) => {
		return {
			approved: true,
			targetMode,
			message: planSummary
				? `Plan approved. Switching to ${targetMode.toUpperCase()} mode to implement: ${planSummary}`
				: `Plan approved. Switching to ${targetMode.toUpperCase()} mode.`,
		};
	},
});
