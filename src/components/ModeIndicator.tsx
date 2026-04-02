import React from 'react';
import { Text } from 'ink';
import type { Mode } from '../utils/permissions.js';
import { MODES } from '../utils/permissions.js';

interface ModeIndicatorProps {
	mode: Mode;
}

export default function ModeIndicator({ mode }: ModeIndicatorProps) {
	const info = MODES[mode];
	return (
		<Text color={info.color as any} bold>
			[{info.label}]
		</Text>
	);
}
