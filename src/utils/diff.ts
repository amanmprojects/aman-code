import { structuredPatch } from 'diff';

export interface DiffLine {
	type: 'add' | 'remove' | 'context' | 'header';
	content: string;
}

export function parseDiff(diffString: string): DiffLine[] {
	const lines: DiffLine[] = [];

	for (const line of diffString.split('\n')) {
		if (line.startsWith('@@')) {
			lines.push({ type: 'header', content: line });
		} else if (line.startsWith('+') && !line.startsWith('+++')) {
			lines.push({ type: 'add', content: line });
		} else if (line.startsWith('-') && !line.startsWith('---')) {
			lines.push({ type: 'remove', content: line });
		} else if (line.startsWith(' ')) {
			lines.push({ type: 'context', content: line });
		}
	}

	return lines;
}

export function generateDiff(
	fileName: string,
	oldContent: string,
	newContent: string,
): string {
	const patch = structuredPatch(fileName, fileName, oldContent, newContent, 'original', 'modified');
	const lines: string[] = [];

	lines.push(`--- ${patch.oldFileName}`);
	lines.push(`+++ ${patch.newFileName}`);

	for (const hunk of patch.hunks) {
		lines.push(
			`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
		);
		for (const line of hunk.lines) {
			lines.push(line);
		}
	}

	return lines.join('\n');
}
