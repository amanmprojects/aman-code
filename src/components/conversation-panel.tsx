import React from 'react';
import {Box, Text} from 'ink';
import {
	type TranscriptStore,
	useTranscriptMessageIds,
} from '../state/transcript-store.js';
import MessageList from './message-list.js';

type ConversationPanelProps = {
	readonly transcriptStore: TranscriptStore;
	readonly isLoading: boolean;
	readonly error: string | undefined;
};

// Keep roughly one terminal viewport of assistant streaming text visible.
const streamingVisibleAssistantLines = 28;

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
					isLoading ? streamingVisibleAssistantLines : undefined
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
