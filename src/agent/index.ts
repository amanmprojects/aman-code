import { ToolLoopAgent } from 'ai';
import { systemPrompt } from '../prompts/system.js';
import "dotenv/config";

export const agent = new ToolLoopAgent({
    model: "minimax/minimax-m2.7",
    instructions: systemPrompt,
});


  