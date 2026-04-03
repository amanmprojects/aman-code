import { ToolLoopAgent } from 'ai';
import { systemPrompt } from '../prompts/system.js';
import { getToolsForMode } from '../tools/index.js';
import type { Mode } from '../utils/permissions.js';
import 'dotenv/config';
import { modelList } from './modelList.js';

export function createAgent(mode: Mode) {
	return new ToolLoopAgent({
		model: modelList[0],
		instructions: systemPrompt,
		tools: getToolsForMode(mode),
	});
}