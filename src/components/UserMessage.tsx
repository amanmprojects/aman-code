import React, {memo} from 'react';
import {Box, Text} from 'ink';

interface Part {
	type: string;
	text: string;
}

/**
 * Render a message row showing a green prompt and the message's concatenated text parts.
 *
 * @param msg - Message object expected to have an `id` (used as the component key) and `parts` (array of `{ type: string; text: string }`) — only parts with `type === 'text'` are joined and displayed.
 * @returns A React element rendering the message row with a green prompt and the message text.
 */
function UserMessage({msg}: {msg: any}) {
	return (
		<Box
			key={msg.id}
			flexDirection="row"
			borderStyle="round"
			borderColor='grey'
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
