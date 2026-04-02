import { ToolLoopAgent } from 'ai';
import { systemPrompt } from '../prompts/system.js';
import { getToolsForMode } from '../tools/index.js';
import type { Mode } from '../utils/permissions.js';
import 'dotenv/config';

export function createAgent(mode: Mode) {
	return new ToolLoopAgent({
		model: 'zai/glm-4.7-flash',
		instructions: systemPrompt,
		tools: getToolsForMode(mode),
	});
}