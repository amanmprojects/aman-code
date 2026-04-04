import {
	mkdtemp,
	readFile,
	readdir,
	rm,
	unlink,
	writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'ava';
import type {UIMessage} from 'ai';
import {
	deleteSession,
	deriveTitle,
	generateSessionId,
	listSessions,
	loadSession,
	saveSession,
	type Session,
} from './sessionStore.js';

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

function createSession(overrides: Partial<Session> = {}): Session {
	const messages = overrides.messages ?? [
		createMessage('user-1', 'user', 'Fix test coverage'),
	];
	const now = new Date().toISOString();

	return {
		id: overrides.id ?? generateSessionId(),
		title: overrides.title ?? deriveTitle(messages),
		createdAt: overrides.createdAt ?? now,
		updatedAt: overrides.updatedAt ?? now,
		mode: overrides.mode ?? 'code',
		cwd: overrides.cwd ?? '/tmp/aman-code-test',
		messages,
	};
}

async function withTemporarySessionsDir(
	run: (sessionsDir: string) => Promise<void>,
): Promise<void> {
	const sessionsDir = await mkdtemp(join(tmpdir(), 'aman-code-sessions-'));
	const previous = process.env['AMAN_CODE_SESSIONS_DIR'];
	process.env['AMAN_CODE_SESSIONS_DIR'] = sessionsDir;

	try {
		await run(sessionsDir);
	} finally {
		if (previous === undefined) {
			Reflect.deleteProperty(process.env, 'AMAN_CODE_SESSIONS_DIR');
		} else {
			process.env['AMAN_CODE_SESSIONS_DIR'] = previous;
		}

		await rm(sessionsDir, {recursive: true, force: true});
	}
}

test('generateSessionId returns unique ids', t => {
	const first = generateSessionId();
	const second = generateSessionId();

	t.regex(first, /^sess-\d+-\d+-[a-f\d]{8}$/);
	t.regex(second, /^sess-\d+-\d+-[a-f\d]{8}$/);
	t.not(first, second);
});

test('deriveTitle extracts first user text', t => {
	const messages: UIMessage[] = [
		createMessage('a1', 'assistant', 'Hello!'),
		createMessage('u1', 'user', 'Fix the auth bug'),
	];

	t.is(deriveTitle(messages), 'Fix the auth bug');
});

test('deriveTitle truncates long text to 60 chars', t => {
	const longText = 'A'.repeat(100);
	const messages: UIMessage[] = [createMessage('u1', 'user', longText)];

	t.is(deriveTitle(messages), 'A'.repeat(57) + '...');
});

test('deriveTitle returns fallback for empty messages', t => {
	t.is(deriveTitle([]), 'Untitled session');
});

test.serial('saveSession persists expected data and updates index', async t => {
	await withTemporarySessionsDir(async sessionsDir => {
		const session = createSession({
			messages: [createMessage('u1', 'user', 'Persist this session')],
			createdAt: '2024-01-01T00:00:00.000Z',
			updatedAt: '2024-01-01T00:01:00.000Z',
		});

		await saveSession(session);

		const rawSession = await readFile(
			join(sessionsDir, `${session.id}.json`),
			'utf8',
		);
		const persistedSession = JSON.parse(rawSession) as Session;
		t.deepEqual(persistedSession, session);

		const rawIndex = await readFile(join(sessionsDir, 'index.json'), 'utf8');
		const persistedIndex = JSON.parse(rawIndex) as Session[];
		t.is(persistedIndex.length, 1);
		t.is(persistedIndex[0]?.id, session.id);
		t.is(persistedIndex[0]?.title, session.title);
	});
});

test.serial(
	'loadSession returns stored session and handles missing/corrupt files',
	async t => {
		await withTemporarySessionsDir(async sessionsDir => {
			const session = createSession({
				messages: [createMessage('u1', 'user', 'Reload me')],
			});
			await saveSession(session);

			const loaded = await loadSession(session.id);
			t.deepEqual(loaded, session);

			t.is(await loadSession(generateSessionId()), undefined);

			await writeFile(
				join(sessionsDir, `${session.id}.json`),
				'{bad json',
				'utf8',
			);
			t.is(await loadSession(session.id), undefined);
		});
	},
);

test.serial('loadSession rejects malformed message shapes', async t => {
	await withTemporarySessionsDir(async sessionsDir => {
		const id = generateSessionId();
		const malformed = {
			id,
			title: 'Bad session',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			mode: 'code',
			cwd: '/tmp',
			messages: [
				{
					id: 1,
					role: 'user',
					parts: [{type: 'text', text: 'oops'}],
				},
			],
		};

		await writeFile(
			join(sessionsDir, `${id}.json`),
			JSON.stringify(malformed),
			'utf8',
		);

		t.is(await loadSession(id), undefined);
	});
});

test.serial(
	'listSessions reflects saved and deleted sessions and rebuilds index',
	async t => {
		await withTemporarySessionsDir(async sessionsDir => {
			const first = createSession({
				messages: [createMessage('u1', 'user', 'First session')],
				updatedAt: '2024-01-01T00:00:00.000Z',
			});
			const second = createSession({
				messages: [createMessage('u2', 'user', 'Second session')],
				updatedAt: '2024-01-01T00:00:01.000Z',
			});

			await saveSession(first);
			await saveSession(second);

			const initial = await listSessions();
			t.deepEqual(
				initial.map(entry => entry.id),
				[second.id, first.id],
			);

			await deleteSession(first.id);
			const afterDelete = await listSessions();
			t.deepEqual(
				afterDelete.map(entry => entry.id),
				[second.id],
			);

			await unlink(join(sessionsDir, 'index.json'));
			const rebuilt = await listSessions();
			t.deepEqual(
				rebuilt.map(entry => entry.id),
				[second.id],
			);
		});
	},
);

test.serial('deleteSession removes file and updates index', async t => {
	await withTemporarySessionsDir(async sessionsDir => {
		const session = createSession();
		await saveSession(session);

		await deleteSession(session.id);

		const files = await readdir(sessionsDir);
		t.false(files.includes(`${session.id}.json`));

		const metadata = await listSessions();
		t.false(metadata.some(entry => entry.id === session.id));
	});
});

test.serial(
	'concurrent saveSession calls preserve all index updates',
	async t => {
		await withTemporarySessionsDir(async () => {
			const first = createSession({
				messages: [createMessage('u1', 'user', 'Concurrent one')],
			});
			const second = createSession({
				messages: [createMessage('u2', 'user', 'Concurrent two')],
			});

			await Promise.all([saveSession(first), saveSession(second)]);

			const listed = await listSessions();
			const ids = listed.map(entry => entry.id);
			t.true(ids.includes(first.id));
			t.true(ids.includes(second.id));
			t.is(new Set(ids).size, 2);
		});
	},
);

test.serial(
	'invalid session ids are rejected for save/delete and ignored for load',
	async t => {
		await withTemporarySessionsDir(async () => {
			const invalidId = '../escape';
			const session = createSession({id: invalidId});

			await t.throwsAsync(saveSession(session), {
				instanceOf: Error,
				message: /Invalid session id/u,
			});

			await t.throwsAsync(deleteSession(invalidId), {
				instanceOf: Error,
				message: /Invalid session id/u,
			});

			t.is(await loadSession(invalidId), undefined);
		});
	},
);
