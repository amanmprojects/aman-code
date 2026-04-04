import {readFile} from './ReadFile/index.js';
import {writeFile} from './WriteFile/index.js';
import {editFile} from './EditFile/index.js';
import {executeCommand, isDangerousCommand} from './ExecuteCommand/index.js';
import {grepSearch} from './GrepSearch/index.js';
import {globSearch} from './GlobSearch/index.js';
import {listDir} from './ListDir/index.js';
import {toolSearch} from './ToolSearch/index.js';
import {webSearch} from './WebSearch/index.js';
import {askUserQuestion} from './AskUserQuestion/index.js';
import {exitPlanMode} from './ExitPlanMode/index.js';
import {todoWrite} from './TodoWrite/index.js';
import {tool, type Tool, type ToolExecutionOptions} from 'ai';
import {z} from 'zod';
import type {Mode} from '../utils/permissions.js';

export {
	readFile,
	writeFile,
	editFile,
	executeCommand,
	grepSearch,
	globSearch,
	listDir,
	toolSearch,
	webSearch,
	askUserQuestion,
	exitPlanMode,
	todoWrite,
};

type AgentTool = Tool<any, any>;

type AgentToolSet = {
	readFile: AgentTool;
	writeFile: AgentTool;
	editFile: AgentTool;
	executeCommand: AgentTool;
	grepSearch: AgentTool;
	globSearch: AgentTool;
	listDir: AgentTool;
	toolSearch: AgentTool;
	webSearch: AgentTool;
	askUserQuestion: AgentTool;
	exitPlanMode: AgentTool;
	todoWrite: AgentTool;
};

const executeCommandWithModeSafety: AgentTool = tool({
	description:
		executeCommand.description ??
		'Execute a shell command and return its output.',
	inputSchema: z.object({
		command: z.string().describe('The shell command to execute'),
		cwd: z.string().optional().describe('Working directory for the command.'),
		timeoutMs: z
			.number()
			.int()
			.positive()
			.max(30 * 60_000)
			.optional(),
		maxOutputChars: z.number().int().positive().max(200_000).optional(),
		background: z.boolean().optional(),
	}),
	execute: async (
		args: {
			command: string;
			cwd?: string;
			timeoutMs?: number;
			maxOutputChars?: number;
			background?: boolean;
		},
		toolOptions: ToolExecutionOptions,
	) => {
		const context = toolOptions.experimental_context as
			| {mode?: Mode}
			| undefined;

		if (context?.mode === 'plan') {
			return {
				error: `Command blocked in PLAN mode: "${args.command}" — command execution is not allowed in PLAN mode. Switch to CODE or YOLO mode to run it.`,
			};
		}

		if (context?.mode === 'code' && isDangerousCommand(args.command)) {
			return {
				error: `Command blocked in CODE mode: "${args.command}" — this looks dangerous. Switch to YOLO mode to run it.`,
			};
		}

		if (executeCommand.execute == null) {
			return {
				error:
					'Command execution tool is unavailable in the current installation.',
			};
		}

		return executeCommand.execute(args, toolOptions);
	},
});

export const allTools: AgentToolSet = {
	readFile,
	writeFile,
	editFile,
	executeCommand: executeCommandWithModeSafety,
	grepSearch,
	globSearch,
	listDir,
	toolSearch,
	webSearch,
	askUserQuestion,
	exitPlanMode,
	todoWrite,
};

export type AgentToolName = keyof AgentToolSet;