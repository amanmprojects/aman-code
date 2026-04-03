import {useCallback, useSyncExternalStore} from 'react';
import type {UIMessage} from 'ai';

export interface TranscriptMeasurement {
	width: number;
	height: number;
	signature: string;
}

interface TranscriptSnapshot {
	orderedIds: string[];
	messagesById: Record<string, UIMessage>;
	measuredHeights: Record<string, TranscriptMeasurement>;
}

export interface TranscriptStore {
	subscribe: (listener: () => void) => () => void;
	getSnapshot: () => TranscriptSnapshot;
	getMessages: () => UIMessage[];
	getMessageIds: () => string[];
	getMessageById: (id: string) => UIMessage | null;
	setMessages: (messages: UIMessage[]) => void;
	setMeasuredHeight: (
		id: string,
		width: number,
		height: number,
		signature: string,
	) => void;
}

export function createTranscriptStore(): TranscriptStore {
	let snapshot: TranscriptSnapshot = {
		orderedIds: [],
		messagesById: {},
		measuredHeights: {},
	};
	let cachedMessages = [] as UIMessage[];
	let cachedOrderedIdsRef = snapshot.orderedIds;
	let cachedMessagesByIdRef = snapshot.messagesById;
	const listeners = new Set<() => void>();

	const publish = (nextSnapshot: TranscriptSnapshot) => {
		if (nextSnapshot === snapshot) {
			return;
		}

		snapshot = nextSnapshot;
		for (const listener of listeners) {
			listener();
		}
	};

	return {
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		getSnapshot() {
			return snapshot;
		},
		getMessages() {
			if (
				cachedOrderedIdsRef === snapshot.orderedIds &&
				cachedMessagesByIdRef === snapshot.messagesById
			) {
				return cachedMessages;
			}

			cachedMessages = snapshot.orderedIds
				.map(id => snapshot.messagesById[id])
				.filter((message): message is UIMessage => message != null);
			cachedOrderedIdsRef = snapshot.orderedIds;
			cachedMessagesByIdRef = snapshot.messagesById;
			return cachedMessages;
		},
		getMessageIds() {
			return snapshot.orderedIds;
		},
		getMessageById(id: string) {
			return snapshot.messagesById[id] ?? null;
		},
		setMessages(messages: UIMessage[]) {
			const nextOrderedIds = messages.map(message => message.id);
			const sameLength = nextOrderedIds.length === snapshot.orderedIds.length;
			const sameOrder =
				sameLength &&
				nextOrderedIds.every((id, index) => id === snapshot.orderedIds[index]);
			let hasMessageChanges = !sameOrder;
			const nextMessagesById: Record<string, UIMessage> = {};

			for (const message of messages) {
				nextMessagesById[message.id] = message;
				if (snapshot.messagesById[message.id] !== message) {
					hasMessageChanges = true;
				}
			}

			if (!hasMessageChanges) {
				return;
			}

			publish({
				...snapshot,
				orderedIds: nextOrderedIds,
				messagesById: nextMessagesById,
			});
		},
		setMeasuredHeight(id, width, height, signature) {
			const nextHeight = Math.max(1, Math.floor(height));
			const currentMeasurement = snapshot.measuredHeights[id];

			if (
				currentMeasurement?.width === width &&
				currentMeasurement.height === nextHeight &&
				currentMeasurement.signature === signature
			) {
				return;
			}

			publish({
				...snapshot,
				measuredHeights: {
					...snapshot.measuredHeights,
					[id]: {
						width,
						height: nextHeight,
						signature,
					},
				},
			});
		},
	};
}

export function useTranscriptSnapshot(store: TranscriptStore) {
	return useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot,
	);
}

export function useTranscriptMessageIds(store: TranscriptStore) {
	return useSyncExternalStore(
		store.subscribe,
		store.getMessageIds,
		store.getMessageIds,
	);
}

export function useTranscriptMessage(store: TranscriptStore, id: string) {
	const getMessageSnapshot = useCallback(
		() => store.getMessageById(id),
		[store, id],
	);

	return useSyncExternalStore(
		store.subscribe,
		getMessageSnapshot,
		getMessageSnapshot,
	);
}
