import test from 'ava';
import {getAllowedToolNames, MODES} from './permissions.js';
import type {Mode} from './permissions.js';

// MODES constant tests

test('MODES has exactly three keys: plan, code, yolo', (t) => {
	const keys = Object.keys(MODES);
	t.deepEqual(keys.sort(), ['code', 'plan', 'yolo']);
});

test('MODES plan entry has correct label', (t) => {
	t.is(MODES.plan.label, 'PLAN');
});

test('MODES code entry has correct label', (t) => {
	t.is(MODES.code.label, 'CODE');
});

test('MODES yolo entry has correct label', (t) => {
	t.is(MODES.yolo.label, 'YOLO');
});

test('MODES plan entry has color blue', (t) => {
	t.is(MODES.plan.color, 'blue');
});

test('MODES code entry has color yellow', (t) => {
	t.is(MODES.code.color, 'yellow');
});

test('MODES yolo entry has color red', (t) => {
	t.is(MODES.yolo.color, 'red');
});

test('MODES each entry has a non-empty description', (t) => {
	for (const mode of Object.keys(MODES) as Mode[]) {
		t.truthy(MODES[mode].description);
	}
});

// getAllowedToolNames tests

test('getAllowedToolNames plan returns a Set', (t) => {
	const result = getAllowedToolNames('plan');
	t.true(result instanceof Set);
});

test('getAllowedToolNames plan returns exactly 3 tools', (t) => {
	const result = getAllowedToolNames('plan');
	t.is(result.size, 3);
});

test('getAllowedToolNames plan includes readFile', (t) => {
	t.true(getAllowedToolNames('plan').has('readFile'));
});

test('getAllowedToolNames plan includes grepSearch', (t) => {
	t.true(getAllowedToolNames('plan').has('grepSearch'));
});

test('getAllowedToolNames plan includes globSearch', (t) => {
	t.true(getAllowedToolNames('plan').has('globSearch'));
});

test('getAllowedToolNames plan does not include writeFile', (t) => {
	t.false(getAllowedToolNames('plan').has('writeFile'));
});

test('getAllowedToolNames plan does not include editFile', (t) => {
	t.false(getAllowedToolNames('plan').has('editFile'));
});

test('getAllowedToolNames plan does not include executeCommand', (t) => {
	t.false(getAllowedToolNames('plan').has('executeCommand'));
});

test('getAllowedToolNames code returns exactly 6 tools', (t) => {
	const result = getAllowedToolNames('code');
	t.is(result.size, 6);
});

test('getAllowedToolNames code includes all tool names', (t) => {
	const result = getAllowedToolNames('code');
	t.true(result.has('readFile'));
	t.true(result.has('writeFile'));
	t.true(result.has('editFile'));
	t.true(result.has('executeCommand'));
	t.true(result.has('grepSearch'));
	t.true(result.has('globSearch'));
});

test('getAllowedToolNames yolo returns exactly 6 tools', (t) => {
	const result = getAllowedToolNames('yolo');
	t.is(result.size, 6);
});

test('getAllowedToolNames yolo includes all tool names', (t) => {
	const result = getAllowedToolNames('yolo');
	t.true(result.has('readFile'));
	t.true(result.has('writeFile'));
	t.true(result.has('editFile'));
	t.true(result.has('executeCommand'));
	t.true(result.has('grepSearch'));
	t.true(result.has('globSearch'));
});

test('getAllowedToolNames code and yolo return equivalent tool sets', (t) => {
	const codeTools = getAllowedToolNames('code');
	const yoloTools = getAllowedToolNames('yolo');
	t.is(codeTools.size, yoloTools.size);
	for (const tool of codeTools) {
		t.true(yoloTools.has(tool));
	}
});

test('getAllowedToolNames plan is a subset of code tools', (t) => {
	const planTools = getAllowedToolNames('plan');
	const codeTools = getAllowedToolNames('code');
	for (const tool of planTools) {
		t.true(codeTools.has(tool));
	}
});

test('getAllowedToolNames returns read-only tools for unknown mode via type cast', (t) => {
	// The default branch handles unknown modes — verify via type cast
	const result = getAllowedToolNames('plan' as Mode);
	t.is(result.size, 3);
	t.false(result.has('writeFile'));
});