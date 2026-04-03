import React from 'react';
import {Box, Text} from 'ink';
import MessageList from './MessageList.js';
import {
	type TranscriptStore,
	useTranscriptMessageIds,
} from '../state/transcriptStore.js';

interface ConversationPanelProps {
	transcriptStore: TranscriptStore;
	isLoading: boolean;
	error: string | null;
}

const STREAMING_VISIBLE_ASSISTANT_LINES = 28;

function ConversationPanel({
	transcriptStore,
	isLoading,
	error,
}: ConversationPanelProps) {
	const messageIds = useTranscriptMessageIds(transcriptStore);
	const streamingMessageId = isLoading ? messageIds.at(-1) : undefined;

	return (
		<Box flexDirection="column">
			<MessageList
				transcriptStore={transcriptStore}
				streamingMessageId={streamingMessageId}
				streamingAssistantTailLines={
					isLoading ? STREAMING_VISIBLE_ASSISTANT_LINES : undefined
				}
			/>
			{error && (
				<Box marginBottom={1} marginTop={1}>
					<Text color="red">Error: {error}</Text>
				</Box>
			)}
		</Box>
	);
}

export default ConversationPanel;
