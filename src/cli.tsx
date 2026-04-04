#!/usr/bin/env node
import 'dotenv/config.js';
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';
import type {Mode} from './utils/permissions.js';
import {listSessions, loadSession} from './state/sessionStore.js';

const cli = meow(
	`
  Usage
    $ aman-code [options]

  Options
    --mode, -m     Permission mode: plan, code, or yolo (default: code)
    --resume, -r   Resume a session (latest if no ID given, or provide a session ID)
    --list, -l     List recent sessions and exit

  Examples
    $ aman-code
    $ aman-code --mode plan
    $ aman-code -m yolo
    $ aman-code --resume
    $ aman-code --resume sess-1234567890-1
    $ aman-code --list
`,
	{
		importMeta: import.meta,
		flags: {
			mode: {
				type: 'string',
				shortFlag: 'm',
				default: 'code',
			},
			resume: {
				type: 'string',
				shortFlag: 'r',
			},
			list: {
				type: 'boolean',
				shortFlag: 'l',
				default: false,
			},
		},
	},
);

const mode = (
	['plan', 'code', 'yolo'].includes(cli.flags.mode) ? cli.flags.mode : 'code'
) as Mode;

async function main() {
	if (cli.flags.list) {
		const sessions = await listSessions();
		if (sessions.length === 0) {
			console.log('No saved sessions.');
		} else {
			console.log('Recent sessions:\n');
			for (const session of sessions.slice(0, 20)) {
				const date = new Date(session.updatedAt).toLocaleString();
				console.log(
					`  ${session.id}  ${date}  [${session.mode}]  ${session.title}`,
				);
				console.log(`    cwd: ${session.cwd}`);
			}
		}

		return;
	}

	if (cli.flags.resume !== undefined) {
		const resumeId = cli.flags.resume.trim();
		let sessionId: string;

		if (resumeId.length > 0) {
			sessionId = resumeId;
		} else {
			const sessions = await listSessions();
			if (sessions.length === 0) {
				console.error('No sessions to resume.');
				process.exit(1);
			}

			sessionId = sessions[0]!.id;
			console.log(`Resuming most recent session: ${sessionId}`);
		}

		const session = await loadSession(sessionId);
		if (!session) {
			console.error(`Session not found or corrupted: ${sessionId}`);
			process.exit(1);
		}

		const sessionMode = (
			['plan', 'code', 'yolo'].includes(session.mode) ? session.mode : mode
		) as Mode;

		render(
			<App
				mode={sessionMode}
				sessionId={session.id}
				initialMessages={session.messages}
			/>,
		);
		return;
	}

	render(<App mode={mode} />);
}

void main();
