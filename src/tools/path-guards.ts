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

export function isBlockedDevicePath(filePath: string): boolean {
	if (blockedDevicePaths.has(filePath)) {
		return true;
	}

	if (
		filePath.startsWith('/proc/') &&
		(filePath.endsWith('/fd/0') ||
			filePath.endsWith('/fd/1') ||
			filePath.endsWith('/fd/2'))
	) {
		return true;
	}

	return false;
}

export function isUncPath(filePath: string): boolean {
	return filePath.startsWith('\\\\') || filePath.startsWith('//');
}

export const isUNCPath = isUncPath;
