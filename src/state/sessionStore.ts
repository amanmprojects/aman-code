import {
	readFile,
	writeFile,
	mkdir,
	unlink,
	readdir,
	open,
	rename,
} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {randomBytes} from 'node:crypto';
import type {UIMessage} from 'ai';

const SESSIONS_DIR = join(homedir(), '.aman-code', 'sessions');
const INDEX_FILE_NAME = 'index.json';
const INDEX_LOCK_FILE_NAME = 'index.json.lock';
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const VALID_MESSAGE_ROLES = new Set(['system', 'user', 'assistant', 'tool']);
const INDEX_LOCK_RETRY_DELAYS_MS = [10, 25, 50, 100, 200, 400];

function getSessionsDir(): string {
	return process.env['AMAN_CODE_SESSIONS_DIR'] ?? SESSIONS_DIR;
}

function getIndexFilePath(): string {
	return join(getSessionsDir(), INDEX_FILE_NAME);
}

function getIndexLockFilePath(): string {
	return join(getSessionsDir(), INDEX_LOCK_FILE_NAME);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isValidSessionId(id: string): boolean {
	return SESSION_ID_PATTERN.test(id);
}

function assertValidSessionId(id: string): void {
	if (!isValidSessionId(id)) {
		throw new Error(`Invalid session id: ${id}`);
	}
}

function getSessionFilePath(id: string): string {
	return join(getSessionsDir(), `${id}.json`);
}

function isValidUIMessagePart(part: unknown): boolean {
	if (!isRecord(part) || typeof part['type'] !== 'string') {
		return false;
	}

	if (part['type'] === 'text' && typeof part['text'] !== 'string') {
		return false;
	}

	if (
		part['toolCallId'] !== undefined &&
		typeof part['toolCallId'] !== 'string'
	) {
		return false;
	}

	if (part['state'] !== undefined && typeof part['state'] !== 'string') {
		return false;
	}

	return true;
}

function isValidUIMessage(message: unknown): message is UIMessage {
	if (!isRecord(message)) {
		return false;
	}

	if (typeof message['id'] !== 'string' || message['id'].trim().length === 0) {
		return false;
	}

	if (
		typeof message['role'] !== 'string' ||
		!VALID_MESSAGE_ROLES.has(message['role'])
	) {
		return false;
	}

	if (
		!Array.isArray(message['parts']) ||
		!message['parts'].every(part => isValidUIMessagePart(part))
	) {
		return false;
	}

	if (
		message['createdAt'] !== undefined &&
		typeof message['createdAt'] !== 'number' &&
		typeof message['createdAt'] !== 'string'
	) {
		return false;
	}

	if (
		message['timestamp'] !== undefined &&
		typeof message['timestamp'] !== 'number' &&
		typeof message['timestamp'] !== 'string'
	) {
		return false;
	}

	return true;
}

function getErrorCode(error: unknown): string | undefined {
	if (
		error != null &&
		typeof error === 'object' &&
		'code' in error &&
		typeof error['code'] === 'string'
	) {
		return error['code'];
	}

	return undefined;
}

async function sleep(milliseconds: number): Promise<void> {
	await new Promise(resolve => {
		setTimeout(resolve, milliseconds);
	});
}

export interface SessionMetadata {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	mode: string;
	cwd: string;
}

export interface Session extends SessionMetadata {
	messages: UIMessage[];
}

let sessionCounter = 0;

export function generateSessionId(): string {
	const randomSuffix = randomBytes(4).toString('hex');
	return `sess-${Date.now()}-${++sessionCounter}-${randomSuffix}`;
}

export function deriveTitle(messages: UIMessage[]): string {
	for (const message of messages) {
		if (message.role !== 'user') {
			continue;
		}

		for (const part of message.parts) {
			if (part.type === 'text' && part.text.trim().length > 0) {
				const text = part.text.trim();
				if (text.length <= 60) {
					return text;
				}

				return text.slice(0, 57) + '...';
			}
		}
	}

	return 'Untitled session';
}

export async function ensureSessionDir(): Promise<void> {
	await mkdir(getSessionsDir(), {recursive: true});
}

function isSessionMetadata(value: unknown): value is SessionMetadata {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value['id'] === 'string' &&
		typeof value['title'] === 'string' &&
		typeof value['createdAt'] === 'string' &&
		typeof value['updatedAt'] === 'string' &&
		typeof value['mode'] === 'string' &&
		typeof value['cwd'] === 'string'
	);
}

async function readIndex(): Promise<SessionMetadata[]> {
	try {
		const raw = await readFile(getIndexFilePath(), 'utf-8');
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed.filter(entry => isSessionMetadata(entry));
	} catch {
		return [];
	}
}

function sortIndexEntries(entries: SessionMetadata[]): SessionMetadata[] {
	return [...entries].sort(
		(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
	);
}

async function writeIndex(entries: SessionMetadata[]): Promise<void> {
	const sorted = sortIndexEntries(entries);
	const indexFilePath = getIndexFilePath();
	const tempFilePath = `${indexFilePath}.${
		process.pid
	}.${Date.now()}.${randomBytes(4).toString('hex')}.tmp`;

	try {
		await writeFile(tempFilePath, JSON.stringify(sorted, null, 2), 'utf-8');
		await rename(tempFilePath, indexFilePath);
	} finally {
		await unlink(tempFilePath).catch(() => {});
	}
}

async function withIndexLock<T>(action: () => Promise<T>): Promise<T> {
	await ensureSessionDir();
	const lockFilePath = getIndexLockFilePath();
	let lockHandle: Awaited<ReturnType<typeof open>> | null = null;

	for (let attempt = 0; ; attempt += 1) {
		try {
			lockHandle = await open(lockFilePath, 'wx');
			break;
		} catch (error) {
			const shouldRetry =
				getErrorCode(error) === 'EEXIST' &&
				attempt < INDEX_LOCK_RETRY_DELAYS_MS.length;

			if (!shouldRetry) {
				throw error;
			}

			const delayMilliseconds = INDEX_LOCK_RETRY_DELAYS_MS[attempt] ?? 0;
			await sleep(delayMilliseconds);
		}
	}

	try {
		return await action();
	} finally {
		await lockHandle?.close().catch(() => {});
		await unlink(lockFilePath).catch(() => {});
	}
}

function toSessionMetadata(session: Session): SessionMetadata {
	return {
		id: session.id,
		title: session.title,
		createdAt: session.createdAt,
		updatedAt: session.updatedAt,
		mode: session.mode,
		cwd: session.cwd,
	};
}

export async function saveSession(session: Session): Promise<void> {
	assertValidSessionId(session.id);
	await ensureSessionDir();

	const filePath = getSessionFilePath(session.id);
	await writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');

	await withIndexLock(async () => {
		const index = await readIndex();
		const existing = index.findIndex(entry => entry.id === session.id);
		const metadata = toSessionMetadata(session);

		if (existing >= 0) {
			index[existing] = metadata;
		} else {
			index.push(metadata);
		}

		await writeIndex(index);
	});
}

export async function loadSession(id: string): Promise<Session | null> {
	if (!isValidSessionId(id)) {
		return null;
	}

	try {
		const filePath = getSessionFilePath(id);
		const raw = await readFile(filePath, 'utf-8');
		const session = JSON.parse(raw) as Session;

		if (
			typeof session.id !== 'string' ||
			session.id !== id ||
			!isValidSessionId(session.id) ||
			!Array.isArray(session.messages) ||
			!session.messages.every(message => isValidUIMessage(message))
		) {
			return null;
		}

		return session;
	} catch {
		return null;
	}
}

export async function listSessions(): Promise<SessionMetadata[]> {
	await ensureSessionDir();
	const index = await readIndex();

	if (index.length > 0) {
		return sortIndexEntries(index);
	}

	// Fallback: rebuild index from session files if index is empty/missing
	try {
		const sessionsDir = getSessionsDir();
		const files = await readdir(sessionsDir);
		const sessionFiles = files.filter(
			f => f.startsWith('sess-') && f.endsWith('.json'),
		);
		const entries: SessionMetadata[] = [];

		for (const file of sessionFiles) {
			try {
				const raw = await readFile(join(sessionsDir, file), 'utf-8');
				const session = JSON.parse(raw) as Session;
				if (
					typeof session.id === 'string' &&
					isValidSessionId(session.id) &&
					Array.isArray(session.messages) &&
					session.messages.every(message => isValidUIMessage(message))
				) {
					entries.push(
						toSessionMetadata({
							...session,
							title: session.title ?? 'Untitled session',
							createdAt: session.createdAt ?? new Date().toISOString(),
							updatedAt: session.updatedAt ?? new Date().toISOString(),
							mode: session.mode ?? 'code',
							cwd: session.cwd ?? process.cwd(),
						}),
					);
				}
			} catch {
				// Skip corrupted files
			}
		}

		if (entries.length > 0) {
			await withIndexLock(async () => {
				await writeIndex(entries);
			});
		}

		return sortIndexEntries(entries);
	} catch {
		return [];
	}
}

export async function deleteSession(id: string): Promise<void> {
	assertValidSessionId(id);
	await ensureSessionDir();

	try {
		await unlink(getSessionFilePath(id));
	} catch {
		// File may not exist
	}

	await withIndexLock(async () => {
		const index = await readIndex();
		const filtered = index.filter(entry => entry.id !== id);
		await writeIndex(filtered);
	});
}
