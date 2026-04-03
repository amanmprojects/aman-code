import { ToolLoopAgent } from 'ai';
import { systemPrompt } from '../prompts/system.js';
import { allTools, type AgentToolName } from '../tools/index.js';
import type { Mode } from '../utils/permissions.js';
import 'dotenv/config';
import { modelList } from './modelList.js';

type AgentCallOptions = {
	activeTools?: AgentToolName[];
	mode?: Mode;
};

export function createAgent() {
	return new ToolLoopAgent<AgentCallOptions, typeof allTools>({
		model: modelList[0],
		instructions: systemPrompt,
		tools: allTools,
		prepareCall: ({ options, ...callArgs }) => ({
			...callArgs,
			activeTools: options?.activeTools,
			experimental_context: {
				mode: options?.mode,
			},
		}),
	});
}