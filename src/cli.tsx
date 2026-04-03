#!/usr/bin/env node
import 'dotenv/config';
import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import App from './app.js';
import type { Mode } from './utils/permissions.js';

const cli = meow(
	`
  Usage
    $ aman-code [options]

  Options
    --mode, -m  Permission mode: plan, code, or yolo (default: code)

  Examples
    $ aman-code
    $ aman-code --mode plan
    $ aman-code -m yolo
`,
	{
		importMeta: import.meta,
		flags: {
			mode: {
				type: 'string',
				shortFlag: 'm',
				default: 'code',
			},
		},
	},
);

const mode = (['plan', 'code', 'yolo'].includes(cli.flags.mode)
	? cli.flags.mode
	: 'code') as Mode;

render(<App mode={mode} />);
