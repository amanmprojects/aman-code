import React, {memo} from 'react';
import {Box, Text} from 'ink';
import type {UIMessage} from 'ai';

type TextPart = Extract<UIMessage['parts'][number], {type: 'text'}>;

/**
 * Render a message row showing a green prompt and the message's concatenated text parts.
 *
 * @param msg - Message object expected to have an `id` (used as the component key) and `parts` (array of `{ type: string; text: string }`) — only parts with `type === 'text'` are joined and displayed.
 * @returns A React element rendering the message row with a green prompt and the message text.
 */
function UserMessage({msg}: {readonly msg: UIMessage}) {
	return (
		<Box
			flexDirection="row"
			borderStyle="round"
			borderColor="grey"
			borderLeft={false}
			borderRight={false}
		>
			<Text bold color="green">
				{' ❯ '}
			</Text>
			<Text>
				{msg.parts
					.filter((part): part is TextPart => part.type === 'text')
					.map(part => part.text)
					.join('')}
			</Text>
		</Box>
	);
}

export default memo(UserMessage);
