import test from 'ava';
import {parseDiff, generateDiff} from './diff.js';
import type {DiffLine} from './diff.js';

// parseDiff tests

test('parseDiff: empty string returns empty array', (t) => {
	t.deepEqual(parseDiff(''), []);
});

test('parseDiff: @@ header line is classified as header', (t) => {
	const result = parseDiff('@@ -1,3 +1,4 @@');
	t.is(result.length, 1);
	t.is(result[0]!.type, 'header');
	t.is(result[0]!.content, '@@ -1,3 +1,4 @@');
});

test('parseDiff: + add line is classified as add', (t) => {
	const result = parseDiff('+added line');
	t.is(result.length, 1);
	t.is(result[0]!.type, 'add');
	t.is(result[0]!.content, '+added line');
});

test('parseDiff: - remove line is classified as remove', (t) => {
	const result = parseDiff('-removed line');
	t.is(result.length, 1);
	t.is(result[0]!.type, 'remove');
	t.is(result[0]!.content, '-removed line');
});

test('parseDiff: space-prefixed line is classified as context', (t) => {
	const result = parseDiff(' context line');
	t.is(result.length, 1);
	t.is(result[0]!.type, 'context');
	t.is(result[0]!.content, ' context line');
});

test('parseDiff: +++ line is not classified as add', (t) => {
	const result = parseDiff('+++ b/some/file.ts');
	t.is(result.length, 0);
});

test('parseDiff: --- line is not classified as remove', (t) => {
	const result = parseDiff('--- a/some/file.ts');
	t.is(result.length, 0);
});

test('parseDiff: unrecognized lines are skipped', (t) => {
	const result = parseDiff('diff --git a/foo.ts b/foo.ts');
	t.is(result.length, 0);
});

test('parseDiff: empty line is skipped', (t) => {
	const result = parseDiff('\n');
	t.is(result.length, 0);
});

test('parseDiff: full unified diff string parses all line types', (t) => {
	const diff = [
		'--- a/file.ts',
		'+++ b/file.ts',
		'@@ -1,3 +1,3 @@',
		' context line',
		'-removed line',
		'+added line',
	].join('\n');

	const result = parseDiff(diff);

	t.is(result.length, 3);
	t.is(result[0]!.type, 'header');
	t.is(result[1]!.type, 'context');
	t.is(result[2]!.type, 'remove');
});

test('parseDiff: multiple hunks and line types in correct order', (t) => {
	const diff = [
		'--- a/foo.ts',
		'+++ b/foo.ts',
		'@@ -1,2 +1,3 @@',
		' unchanged',
		'-old',
		'+new',
		'+extra',
		'@@ -10,1 +11,1 @@',
		' another context',
	].join('\n');

	const result = parseDiff(diff);

	const types = result.map((l: DiffLine) => l.type);
	t.deepEqual(types, ['header', 'context', 'remove', 'add', 'add', 'header', 'context']);
});

test('parseDiff: preserves content exactly including prefix character', (t) => {
	const result = parseDiff('+const x = 1;');
	t.is(result[0]!.content, '+const x = 1;');
});

// generateDiff tests

test('generateDiff: identical content produces header lines with no hunks', (t) => {
	const result = generateDiff('file.ts', 'hello\n', 'hello\n');
	t.true(result.startsWith('--- file.ts'));
	t.true(result.includes('+++ file.ts'));
	// No @@ hunk headers when content is identical
	t.false(result.includes('@@'));
});

test('generateDiff: added line appears as + in output', (t) => {
	const result = generateDiff('file.ts', 'line1\n', 'line1\nnew line\n');
	t.true(result.includes('+new line'));
});

test('generateDiff: removed line appears as - in output', (t) => {
	const result = generateDiff('file.ts', 'line1\nold line\n', 'line1\n');
	t.true(result.includes('-old line'));
});

test('generateDiff: output starts with --- filename header', (t) => {
	const result = generateDiff('src/utils/foo.ts', 'a\n', 'b\n');
	const lines = result.split('\n');
	t.is(lines[0], '--- src/utils/foo.ts');
});

test('generateDiff: output second line is +++ filename header', (t) => {
	const result = generateDiff('src/utils/foo.ts', 'a\n', 'b\n');
	const lines = result.split('\n');
	t.is(lines[1], '+++ src/utils/foo.ts');
});

test('generateDiff: output contains @@ hunk header for changed content', (t) => {
	const result = generateDiff('file.ts', 'a\n', 'b\n');
	t.true(result.includes('@@'));
});

test('generateDiff: returns a string', (t) => {
	const result = generateDiff('file.ts', '', '');
	t.is(typeof result, 'string');
});

test('generateDiff: empty old and new content produces minimal output', (t) => {
	const result = generateDiff('file.ts', '', '');
	t.true(result.includes('--- file.ts'));
	t.true(result.includes('+++ file.ts'));
	t.false(result.includes('@@'));
});

test('generateDiff: output is parseable by parseDiff', (t) => {
	const diff = generateDiff('file.ts', 'foo\nbar\n', 'foo\nbaz\n');
	const parsed = parseDiff(diff);

	// Should have at least one header, one remove, one add
	const types = new Set(parsed.map((l: DiffLine) => l.type));
	t.true(types.has('header'));
	t.true(types.has('remove'));
	t.true(types.has('add'));
});

test('generateDiff: changed line shows old as remove and new as add', (t) => {
	const result = generateDiff('file.ts', 'original\n', 'modified\n');
	t.true(result.includes('-original'));
	t.true(result.includes('+modified'));
});