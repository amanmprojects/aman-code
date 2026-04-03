import {useSyncExternalStore} from 'react';
import type {UIMessage} from 'ai';

export interface TranscriptViewportState {
	scrollTopRows: number;
	isStickyToBottom: boolean;
	heightRows: number;
	widthCols: number;
}

export interface TranscriptMeasurement {
	width: number;
	height: number;
	signature: string;
}

interface TranscriptSnapshot {
	orderedIds: string[];
	messagesById: Record<string, UIMessage>;
	measuredHeights: Record<string, TranscriptMeasurement>;
	viewport: TranscriptViewportState;
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
	setViewportMetrics: (metrics: {
		heightRows: number;
		widthCols: number;
	}) => void;
	setScrollTop: (
		scrollTopRows: number,
		options?: {
			maxScrollTop?: number;
			isStickyToBottom?: boolean;
		},
	) => void;
	scrollBy: (deltaRows: number, maxScrollTop: number) => void;
	scrollToTop: () => void;
	scrollToBottom: (maxScrollTop?: number) => void;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), maximum);
}

export function createTranscriptStore(): TranscriptStore {
	let snapshot: TranscriptSnapshot = {
		orderedIds: [],
		messagesById: {},
		measuredHeights: {},
		viewport: {
			scrollTopRows: 0,
			isStickyToBottom: true,
			heightRows: 0,
			widthCols: 0,
		},
	};
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
			return snapshot.orderedIds
				.map(id => snapshot.messagesById[id])
				.filter((message): message is UIMessage => message != null);
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
		setViewportMetrics(metrics) {
			const nextHeightRows = Math.max(0, Math.floor(metrics.heightRows));
			const nextWidthCols = Math.max(0, Math.floor(metrics.widthCols));

			if (
				snapshot.viewport.heightRows === nextHeightRows &&
				snapshot.viewport.widthCols === nextWidthCols
			) {
				return;
			}

			publish({
				...snapshot,
				viewport: {
					...snapshot.viewport,
					heightRows: nextHeightRows,
					widthCols: nextWidthCols,
				},
			});
		},
		setScrollTop(scrollTopRows, options) {
			const maxScrollTop = Math.max(0, options?.maxScrollTop ?? scrollTopRows);
			const nextScrollTop = clamp(scrollTopRows, 0, maxScrollTop);
			const nextSticky =
				options?.isStickyToBottom ?? snapshot.viewport.isStickyToBottom;

			if (
				snapshot.viewport.scrollTopRows === nextScrollTop &&
				snapshot.viewport.isStickyToBottom === nextSticky
			) {
				return;
			}

			publish({
				...snapshot,
				viewport: {
					...snapshot.viewport,
					scrollTopRows: nextScrollTop,
					isStickyToBottom: nextSticky,
				},
			});
		},
		scrollBy(deltaRows, maxScrollTop) {
			const nextScrollTop = clamp(
				snapshot.viewport.scrollTopRows + deltaRows,
				0,
				Math.max(0, maxScrollTop),
			);
			const nextSticky = nextScrollTop >= maxScrollTop;

			if (
				snapshot.viewport.scrollTopRows === nextScrollTop &&
				snapshot.viewport.isStickyToBottom === nextSticky
			) {
				return;
			}

			publish({
				...snapshot,
				viewport: {
					...snapshot.viewport,
					scrollTopRows: nextScrollTop,
					isStickyToBottom: nextSticky,
				},
			});
		},
		scrollToTop() {
			if (
				snapshot.viewport.scrollTopRows === 0 &&
				snapshot.viewport.isStickyToBottom === false
			) {
				return;
			}

			publish({
				...snapshot,
				viewport: {
					...snapshot.viewport,
					scrollTopRows: 0,
					isStickyToBottom: false,
				},
			});
		},
		scrollToBottom(maxScrollTop = 0) {
			const clampedMaxScrollTop = Math.max(0, maxScrollTop);
			if (
				snapshot.viewport.scrollTopRows === clampedMaxScrollTop &&
				snapshot.viewport.isStickyToBottom
			) {
				return;
			}

			publish({
				...snapshot,
				viewport: {
					...snapshot.viewport,
					scrollTopRows: clampedMaxScrollTop,
					isStickyToBottom: true,
				},
			});
		},
	};
}

export function useTranscriptSnapshot(store: TranscriptStore) {
	return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useTranscriptMessageIds(store: TranscriptStore) {
	return useSyncExternalStore(
		store.subscribe,
		store.getMessageIds,
		store.getMessageIds,
	);
}

export function useTranscriptMessage(store: TranscriptStore, id: string) {
	return useSyncExternalStore(
		store.subscribe,
		() => store.getMessageById(id),
		() => store.getMessageById(id),
	);
}

export function useTranscriptViewport(store: TranscriptStore) {
	return useSyncExternalStore(
		store.subscribe,
		() => store.getSnapshot().viewport,
		() => store.getSnapshot().viewport,
	);
}
