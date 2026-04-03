import { ToolLoopAgent } from 'ai';
import { systemPrompt } from '../prompts/system.js';
import { getToolsForMode } from '../tools/index.js';
import type { Mode } from '../utils/permissions.js';
import 'dotenv/config';
import { modelList } from './modelList.js';

export function createAgent(mode: Mode) {
	const defaultModel = modelList[0];

	if (!defaultModel) {
		throw new Error('No language model configured');
	}

	return new ToolLoopAgent({
		model: defaultModel,
		instructions: systemPrompt,
		tools: getToolsForMode(mode),
	});
}