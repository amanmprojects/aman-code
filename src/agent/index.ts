import {ToolLoopAgent} from 'ai';
import {codePrompt} from '../prompts/code.js';
import {planPrompt} from '../prompts/plan.js';
import {allTools, type AgentToolName} from '../tools/index.js';
import type {Mode} from '../utils/permissions.js';
import 'dotenv/config';
import {modelList} from './modelList.js';

type AgentCallOptions = {
	activeTools?: AgentToolName[];
	mode?: Mode;
};

function getSystemPromptForMode(mode: Mode | undefined) {
	return mode === 'plan' ? planPrompt : codePrompt;
}

export function createAgent(): ToolLoopAgent<
	AgentCallOptions,
	typeof allTools
> {
	return new ToolLoopAgent<AgentCallOptions, typeof allTools>({
		model: modelList[0],
		instructions: codePrompt,
		tools: allTools,
		prepareCall: ({options, ...callArgs}) => ({
			...callArgs,
			instructions: getSystemPromptForMode(options?.mode),
			activeTools: options?.activeTools,
			experimental_context: {
				mode: options?.mode,
			},
		}),
	});
}
