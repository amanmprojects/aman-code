import React from 'react';
import {Box} from 'ink';
import BigText from 'ink-big-text';
import Divider from 'ink-divider';

function AppHeader() {
	return (
		<Box marginBottom={1} flexDirection="column" height={12} flexShrink={0}>
			<Divider />
			<BigText text="aman-code" />
			<Divider />
		</Box>
	);
}

export default AppHeader;
