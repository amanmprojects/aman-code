import {readFile} from './readFile.js';
import {writeFile} from './writeFile.js';
import {editFile} from './editFile.js';
import {executeCommand, isDangerousCommand} from './executeCommand.js';
import {grepSearch} from './grepSearch.js';
import {globSearch} from './globSearch.js';
import {listDir} from './listDir.js';
import {toolSearch} from './toolSearch.js';
import {webSearch} from './webSearch.js';
import {askUserQuestion} from './askUserQuestion.js';
import {exitPlanMode} from './exitPlanMode.js';
import {todoWrite} from './todoWrite.js';
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
