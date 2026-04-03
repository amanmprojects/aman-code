import React, {memo} from 'react';
import {Box, Text} from 'ink';
import Spinner from 'ink-spinner';
import type {UIMessage} from 'ai';
import MessageList from './MessageList.js';

interface ConversationPanelProps {
	messages: UIMessage[];
	isLoading: boolean;
	error: string | null;
}

function ConversationPanel({
	messages,
	isLoading,
	error,
}: ConversationPanelProps) {
	return (
		<>
			<MessageList messages={messages} />

			{isLoading && messages.length > 0 && (
				<Box marginBottom={1} marginTop={1} marginLeft={1}>
					<Text color="yellow">
						<Spinner type="dots" />
					</Text>
					<Text dimColor> Thinking...</Text>
				</Box>
			)}

			{error && (
				<Box marginBottom={1} marginTop={1}>
					<Text color="red">Error: {error}</Text>
				</Box>
			)}
		</>
	);
}

export default memo(ConversationPanel);
