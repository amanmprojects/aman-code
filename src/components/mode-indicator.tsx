import React from 'react';
import {Text} from 'ink';
import type {Mode} from '../utils/permissions.js';
import {modes} from '../utils/permissions.js';

type ModeIndicatorProps = {
	readonly mode: Mode;
};

export default function ModeIndicator({mode}: ModeIndicatorProps) {
	const info = modes[mode];
	return (
		<Text bold color={info.color as 'blue' | 'yellow' | 'red'}>
			[{info.label}]
		</Text>
	);
}
