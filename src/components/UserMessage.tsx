import React, {memo} from 'react';
import {Box, Text} from 'ink';

interface Part {
	type: string;
	text: string;
}

function UserMessage({msg}: {msg: any}) {
	return (
		<Box
			key={msg.id}
			flexDirection="row"
			borderStyle="round"
			borderDimColor={true}
			borderLeft={false}
			borderRight={false}
		>
			<Text color="green" bold>
				{' ❯ '}
			</Text>
			<Text>
				{msg.parts
					.filter((p: Part) => p.type === 'text')
					.map((p: Part) => p.text)
					.join('')}
			</Text>
		</Box>
	);
}

export default memo(UserMessage);
