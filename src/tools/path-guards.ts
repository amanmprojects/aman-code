import {realpath} from 'node:fs/promises';
import * as path from 'node:path';

const blockedDevicePaths = new Set([
	'/dev/null',
	'/dev/zero',
	'/dev/random',
	'/dev/urandom',
	'/dev/full',
	'/dev/mem',
	'/dev/kmem',
	'/dev/port',
	'/dev/stdin',
	'/dev/tty',
	'/dev/console',
	'/dev/stdout',
	'/dev/stderr',
	'/dev/fd/0',
	'/dev/fd/1',
	'/dev/fd/2',
]);

const blockedDevicePathPatterns = [
	/^\/dev\/sd[a-z]\d*$/,
	/^\/dev\/nvme\d+n\d+(?:p\d+)?$/,
	/^\/dev\/hd[a-z]\d*$/,
	/^\/dev\/loop\d+$/,
	/^\/dev\/kmsg$/,
	/^\/dev\/ptmx$/,
];

const blockedProcPathPatterns = [
	/^\/proc\/\d+\/fd\/[0-2]$/,
	/^\/proc\/\d+\/mem$/,
	/^\/proc\/\d+\/kcore$/,
	/^\/proc\/\d+\/environ$/,
];

const MAX_CACHE_SIZE = 1024;

const resolvedPathCache = new Map<string, string>();
const blockedPathCache = new Map<string, boolean>();

function boundedCacheSet<T>(
	cache: Map<string, T>,
	key: string,
	value: T,
	maxSize: number,
): void {
	if (cache.has(key)) {
		cache.delete(key);
	}

	cache.set(key, value);

	if (cache.size > maxSize) {
		const oldestKeyIterator = cache.keys().next();
		if (oldestKeyIterator.done === false) {
			cache.delete(oldestKeyIterator.value);
		}
	}
}

export function clearPathCaches(): void {
	resolvedPathCache.clear();
	blockedPathCache.clear();
}

async function normalizeAndResolvePath(filePath: string): Promise<string> {
	const normalizedPath = path.resolve(path.normalize(filePath));
	const cachedResolvedPath = resolvedPathCache.get(normalizedPath);
	if (cachedResolvedPath !== undefined) {
		return cachedResolvedPath;
	}

	try {
		const resolvedPath = await realpath(normalizedPath);
		boundedCacheSet(
			resolvedPathCache,
			normalizedPath,
			resolvedPath,
			MAX_CACHE_SIZE,
		);
		return resolvedPath;
	} catch {
		boundedCacheSet(
			resolvedPathCache,
			normalizedPath,
			normalizedPath,
			MAX_CACHE_SIZE,
		);
		return normalizedPath;
	}
}

export async function isBlockedDevicePath(filePath: string): Promise<boolean> {
	const cachedBlockedPath = blockedPathCache.get(filePath);
	if (cachedBlockedPath !== undefined) {
		return cachedBlockedPath;
	}

	const resolvedPath = await normalizeAndResolvePath(filePath);
	const cachedResolvedPath = blockedPathCache.get(resolvedPath);
	if (cachedResolvedPath !== undefined) {
		boundedCacheSet(
			blockedPathCache,
			filePath,
			cachedResolvedPath,
			MAX_CACHE_SIZE,
		);
		return cachedResolvedPath;
	}

	const isBlocked =
		blockedDevicePaths.has(resolvedPath) ||
		blockedDevicePathPatterns.some(pattern => pattern.test(resolvedPath)) ||
		(resolvedPath.startsWith('/proc/') &&
			blockedProcPathPatterns.some(pattern => pattern.test(resolvedPath)));

	boundedCacheSet(blockedPathCache, filePath, isBlocked, MAX_CACHE_SIZE);
	if (filePath !== resolvedPath) {
		boundedCacheSet(blockedPathCache, resolvedPath, isBlocked, MAX_CACHE_SIZE);
	}
	return isBlocked;
}

export function isUncPath(filePath: string): boolean {
	return filePath.startsWith('\\\\') || filePath.startsWith('//');
}

export const isUNCPath = isUncPath;
