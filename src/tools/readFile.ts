import {tool} from 'ai';
import {z} from 'zod';
import * as fs from 'node:fs/promises';
import {createReadStream, type Stats} from 'node:fs';
import * as path from 'node:path';
import {isBlockedDevicePath, isUNCPath} from './pathGuards.js';

// Maximum file size for full reads (256KB)
const MAX_FILE_SIZE_BYTES = 256 * 1024;

// Common binary extensions to reject
const BINARY_EXTENSIONS = new Set([
	'exe',
	'dll',
	'so',
	'dylib',
	'bin',
	'zip',
	'tar',
	'gz',
	'bz2',
	'xz',
	'7z',
	'rar',
	'jpg',
	'jpeg',
	'png',
	'gif',
	'webp',
	'bmp',
	'ico',
	'pdf',
	'doc',
	'docx',
	'xls',
	'xlsx',
	'ppt',
	'pptx',
	'mp3',
	'mp4',
	'avi',
	'mov',
	'wav',
	'flac',
	'ogg',
	'wasm',
	'class',
	'jar',
	'o',
	'a',
]);

function hasBinaryExtension(filePath: string): boolean {
	const ext = path.extname(filePath).toLowerCase().slice(1);
	return BINARY_EXTENSIONS.has(ext);
}

/**
 * Determines whether a file is likely binary.
 *
 * Checks the file's extension against a known binary list and samples the file's first 8KB for null bytes; read errors are suppressed and treated as "not binary".
 *
 * @param filePath - Path to the file to inspect
 * @returns `true` if the file is likely binary (binary extension or contains a null byte within the first 8KB), `false` otherwise.
 */
async function isBinaryFile(filePath: string): Promise<boolean> {
	// Quick check: extension-based
	if (hasBinaryExtension(filePath)) return true;

	// Read first 8KB to check for null bytes (common in binary files)
	try {
		const buffer = Buffer.alloc(8192);
		const stream = createReadStream(filePath, {start: 0, end: 8191});
		let bytesRead = 0;

		for await (const chunk of stream) {
			const buf = chunk as Buffer;
			const toCopy = Math.min(buf.length, buffer.length - bytesRead);
			buf.copy(buffer, bytesRead, 0, toCopy);
			bytesRead += toCopy;
			if (bytesRead >= buffer.length) break;
		}

		// Check for null bytes in the sampled content
		for (let i = 0; i < bytesRead; i++) {
			if (buffer[i] === 0) return true;
		}
	} catch {
		// If we can't read, assume it's not binary and let text reading fail naturally
	}

	return false;
}

/**
 * Suggests a filename in the same directory as a requested path when the exact target is missing.
 *
 * Searches the target's directory for files whose names contain each other or share the same basename
 * (ignoring extensions). If a similar file is found and resides under `cwd`, returns its relative path
 * with OS separators normalized to `/`; otherwise returns the similar file's basename. Returns `null`
 * if no suggestion can be produced or an error occurs while searching.
 *
 * @param targetPath - The original (missing) target path to base suggestions on
 * @param cwd - Current working directory used to produce a relative suggestion when possible
 * @returns A forward-slash normalized relative path to a similar file under `cwd`, the similar filename if not under `cwd`, or `null` if no suggestion exists
 */
async function findSimilarFiles(
	targetPath: string,
	cwd: string,
): Promise<string | null> {
	try {
		const dir = path.dirname(targetPath);
		const targetName = path.basename(targetPath).toLowerCase();

		// Check if directory exists
		const dirStat = await fs.stat(dir).catch(() => null);
		if (!dirStat?.isDirectory()) return null;

		const entries = await fs.readdir(dir, {withFileTypes: true});
		const files = entries.filter(e => e.isFile()).map(e => e.name);

		// Find files with similar names
		const similar = files.filter(f => {
			const lower = f.toLowerCase();
			// Same name different extension, or contains target name, or vice versa
			return (
				lower !== targetName &&
				(lower.startsWith(targetName) ||
					targetName.startsWith(lower) ||
					lower.includes(targetName) ||
					targetName.includes(lower) ||
					path.basename(lower, path.extname(lower)) ===
						path.basename(targetName, path.extname(targetName)))
			);
		});

		if (similar.length > 0) {
			// Return the first similar file with relative path if under cwd
			const similarPath = path.join(dir, similar[0]!);
			const relativePath = path.relative(cwd, similarPath);
			if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
				return relativePath.replaceAll(path.sep, '/');
			}
			return similar[0]!;
		}
	} catch {
		// Ignore errors in suggestion logic
	}

	return null;
}

/**
 * Provide a normalized forward-slash relative path from `cwd` to `targetPath` when `targetPath` is located under `cwd`.
 *
 * @param targetPath - The absolute or relative path to the target file or directory
 * @param cwd - The base directory used to compute a relative path (typically `process.cwd()`)
 * @returns The relative path with `/` as separators when `targetPath` is within `cwd`, `null` otherwise
 */
function suggestPathUnderCwd(
	targetPath: string,
	cwd: string,
): string | null {
	// If the path doesn't exist, try to suggest a path relative to cwd
	const relativePath = path.relative(cwd, targetPath);
	if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
		return null;
	}
	return relativePath.replaceAll(path.sep, '/');
}

export const readFile = tool({
	description:
		'Read the contents of a file at the specified path. Returns the file contents with line numbers. Use this to understand existing code before making changes.',
	inputSchema: z.object({
		filePath: z
			.string()
			.describe('Absolute or relative path to the file to read'),
		offset: z
			.number()
			.optional()
			.describe('1-indexed line number to start reading from'),
		limit: z
			.number()
			.optional()
			.describe('Number of lines to read from the offset'),
	}),
	execute: async ({filePath, offset, limit}) => {
		const cwd = process.cwd();

		try {
			// Normalize and resolve the path
			const resolved = path.resolve(filePath);

			// Security: Block UNC paths to prevent NTLM credential leaks
			if (isUNCPath(resolved)) {
				return {
					error: `Cannot read UNC path: ${filePath}. Use a local path instead.`,
				};
			}

			// Security: Block device files that would hang or produce infinite output
			if (isBlockedDevicePath(resolved)) {
				return {
					error: `Cannot read device file: ${filePath}. This file would block or produce infinite output.`,
				};
			}

			// Check if path exists (using lstat to detect symlinks)
			let stat: Stats;
			try {
				stat = await fs.lstat(resolved);
			} catch (error: any) {
				if (error?.code === 'ENOENT') {
					// Try to provide helpful suggestions
					let message = `File not found: ${resolved}. Current working directory: ${cwd}.`;

					// Suggest path under cwd if applicable
					const cwdSuggestion = suggestPathUnderCwd(resolved, cwd);
					if (cwdSuggestion) {
						message += ` Did you mean ${cwdSuggestion}?`;
					} else {
						// Try to find similar files
						const similar = await findSimilarFiles(resolved, cwd);
						if (similar) {
							message += ` Did you mean ${similar}?`;
						}
					}

					return {error: message};
				}
				throw error;
			}

			// Check if it's a directory
			if (stat.isDirectory()) {
				return {error: `Path is a directory, not a file: ${resolved}`};
			}

			// Check if it's a symbolic link
			if (stat.isSymbolicLink()) {
				return {
					error: `Cannot read symbolic link: ${resolved}. Resolve the link first.`,
				};
			}

			if (!stat.isFile()) {
				return {
					error: `Path is not a regular file: ${resolved}. Cannot read special file types.`,
				};
			}

			// Check file size before reading
			if (stat.size > MAX_FILE_SIZE_BYTES) {
				return {
					error: `File is too large (${(stat.size / 1024).toFixed(
						1,
					)}KB) to read at once. Maximum size is ${
						MAX_FILE_SIZE_BYTES / 1024
					}KB. Use offset and limit to read specific portions.`,
				};
			}

			// Check for binary files
			const isBinary = await isBinaryFile(resolved);
			if (isBinary) {
				return {
					error: `Cannot read binary file: ${resolved}. This appears to be a binary file.`,
				};
			}

			// Read the file
			const content = await fs.readFile(resolved, 'utf-8');
			const lines = content.split('\n');
			const totalLines = lines.length;

			// Handle empty file
			if (totalLines === 0 || (totalLines === 1 && lines[0] === '')) {
				return {
					filePath: resolved,
					totalLines: 0,
					startLine: 1,
					endLine: 0,
					content:
						'<system-reminder>Warning: the file exists but the contents are empty.</system-reminder>',
				};
			}

			// Determine line range
			let startLine = 1;
			let endLine = totalLines;

			if (offset !== undefined) {
				startLine = Math.max(1, offset);
				if (limit !== undefined) {
					endLine = Math.min(totalLines, startLine + limit - 1);
				}
			}

			// Handle offset beyond file length
			if (startLine > totalLines) {
				return {
					filePath: resolved,
					totalLines,
					startLine,
					endLine: totalLines,
					content: `<system-reminder>Warning: the file exists but is shorter than the provided offset (${startLine}). The file has ${totalLines} lines.</system-reminder>`,
				};
			}

			// Extract requested lines and add line numbers
			const selectedLines = lines.slice(startLine - 1, endLine);
			const numbered = selectedLines
				.map((line, i) => `${String(startLine + i).padStart(6, ' ')}│ ${line}`)
				.join('\n');

			return {
				filePath: resolved,
				totalLines,
				startLine,
				endLine,
				content: numbered,
			};
		} catch (error: any) {
			// Handle specific error codes
			if (error?.code === 'EACCES' || error?.code === 'EPERM') {
				return {error: `Permission denied: ${filePath}`};
			}
			if (error?.code === 'EISDIR') {
				return {error: `Path is a directory: ${filePath}`};
			}
			if (error?.code === 'ENOTDIR') {
				return {error: `Not a directory in path: ${filePath}`};
			}
			if (error?.code === 'ENAMETOOLONG') {
				return {error: `File path too long: ${filePath}`};
			}

			return {error: `Failed to read file: ${error.message}`};
		}
	},
});
