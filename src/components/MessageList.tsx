import React, {memo} from 'react';
import {Box} from 'ink';
import AssistantMessage from './AssistantMessage.js';
import UserMessage from './UserMessage.js';
import {
	type TranscriptStore,
	useTranscriptMessage,
	useTranscriptMessageIds,
} from '../state/transcriptStore.js';

interface MessageListProps {
	transcriptStore: TranscriptStore;
	messageIds?: string[];
	streamingMessageId?: string;
	streamingAssistantTailLines?: number;
}

interface MessageRowProps {
	id: string;
	transcriptStore: TranscriptStore;
	tailLines?: number;
}

/**
 * Renders a vertical list of chat messages.
 *
 * Each row subscribes to a single message by id so large streaming tool updates
 * don't force the entire transcript through deep equality checks on every chunk.
 *
 * @param transcriptStore - External message store used to subscribe to message ids
 * and individual messages
 * @returns A JSX element containing the messages arranged vertically
 */
const MessageRow = memo(function MessageRow({
	id,
	transcriptStore,
	tailLines,
}: MessageRowProps) {
	const message = useTranscriptMessage(transcriptStore, id);

	if (message == null) {
		return null;
	}

	if (message.role === 'user') {
		return <UserMessage msg={message} />;
	}

	return <AssistantMessage message={message} tailLines={tailLines} />;
});

function MessageList({
	transcriptStore,
	messageIds,
	streamingMessageId,
	streamingAssistantTailLines,
}: MessageListProps) {
	const storeMessageIds = useTranscriptMessageIds(transcriptStore);
	const visibleMessageIds = messageIds ?? storeMessageIds;

	return (
		<Box flexDirection="column">
			{visibleMessageIds.map(id => (
				<MessageRow
					key={id}
					id={id}
					transcriptStore={transcriptStore}
					tailLines={
						id === streamingMessageId ? streamingAssistantTailLines : undefined
					}
				/>
			))}
		</Box>
	);
}

export default memo(MessageList);
