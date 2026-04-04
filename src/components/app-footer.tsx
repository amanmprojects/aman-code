import React, {memo} from 'react';
import {Box, Spacer, Text} from 'ink';
import type {Mode} from '../utils/permissions.js';
import ModeIndicator from './mode-indicator.js';

type AppFooterProps = {
	readonly mode: Mode;
	readonly hasPendingInteraction: boolean;
};

function AppFooter({mode, hasPendingInteraction}: AppFooterProps) {
	return (
		<Box paddingLeft={1} paddingRight={1}>
			<ModeIndicator mode={mode} />
			<Spacer />
			<Text>
				{hasPendingInteraction
					? 'Interactive tool active • Complete the prompt to continue'
					: 'Tab/Shift+Tab to change mode • Ctrl+C to exit'}
			</Text>
		</Box>
	);
}

export default memo(AppFooter);
