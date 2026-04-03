import test from 'ava';
import type {UIMessage} from 'ai';
import {createTranscriptStore} from './transcriptStore.js';

function createMessage(
	id: string,
	role: UIMessage['role'],
	text: string,
): UIMessage {
	return {
		id,
		role,
		parts: [{type: 'text', text}],
	};
}

test('setMessages preserves ordered ids and message lookup', t => {
	const store = createTranscriptStore();
	const first = createMessage('user-1', 'user', 'hello');
	const second = createMessage('assistant-1', 'assistant', 'world');

	store.setMessages([first, second]);

	t.deepEqual(store.getMessageIds(), ['user-1', 'assistant-1']);
	t.is(store.getMessageById('user-1'), first);
	t.deepEqual(store.getMessages(), [first, second]);
});

test('setMeasuredHeight stores width, height and signature', t => {
	const store = createTranscriptStore();

	store.setMeasuredHeight('assistant-1', 80, 6, 'signature-1');

	t.deepEqual(store.getSnapshot().measuredHeights['assistant-1'], {
		width: 80,
		height: 6,
		signature: 'signature-1',
	});
});
