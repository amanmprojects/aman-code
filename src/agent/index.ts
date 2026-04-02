import { ToolLoopAgent } from 'ai';
import { systemPrompt } from '../prompts/system.js';
import "dotenv/config";

export default new ToolLoopAgent({
    model: "minimax/minimax-m2.7",
    instructions: systemPrompt,
});


  