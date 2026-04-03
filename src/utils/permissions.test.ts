import test from 'ava';
import {applyHeadLimit, getPreStatLimit} from './headLimit.js';
import {getAllowedToolNames, MODES} from './permissions.js';
import type {Mode} from './permissions.js';

// MODES constant tests

test('MODES has exactly three keys: plan, code, yolo', t => {
	const keys = Object.keys(MODES);
	t.deepEqual(keys.sort(), ['code', 'plan', 'yolo']);
});

test('MODES plan entry has correct label', t => {
	t.is(MODES.plan.label, 'PLAN');
});

test('MODES code entry has correct label', t => {
	t.is(MODES.code.label, 'CODE');
});

test('MODES yolo entry has correct label', t => {
	t.is(MODES.yolo.label, 'YOLO');
});

test('MODES plan entry has color blue', t => {
	t.is(MODES.plan.color, 'blue');
});

test('MODES code entry has color yellow', t => {
	t.is(MODES.code.color, 'yellow');
});

test('MODES yolo entry has color red', t => {
	t.is(MODES.yolo.color, 'red');
});

test('MODES each entry has a non-empty description', t => {
	for (const mode of Object.keys(MODES) as Mode[]) {
		t.truthy(MODES[mode].description);
	}
});

// getAllowedToolNames tests

test('getAllowedToolNames plan returns a Set', t => {
	const result = getAllowedToolNames('plan');
	t.true(result instanceof Set);
});

test('getAllowedToolNames plan returns exactly 9 tools', t => {
	const result = getAllowedToolNames('plan');
	t.is(result.size, 9);
});

test('getAllowedToolNames plan includes read-only tools', t => {
	t.true(getAllowedToolNames('plan').has('readFile'));
	t.true(getAllowedToolNames('plan').has('grepSearch'));
	t.true(getAllowedToolNames('plan').has('globSearch'));
	t.true(getAllowedToolNames('plan').has('listDir'));
	t.true(getAllowedToolNames('plan').has('toolSearch'));
	t.true(getAllowedToolNames('plan').has('webSearch'));
	t.true(getAllowedToolNames('plan').has('askUserQuestion'));
	t.true(getAllowedToolNames('plan').has('exitPlanMode'));
	t.true(getAllowedToolNames('plan').has('todoWrite'));
});

test('getAllowedToolNames plan does not include mutating tools', t => {
	t.false(getAllowedToolNames('plan').has('writeFile'));
	t.false(getAllowedToolNames('plan').has('editFile'));
	t.false(getAllowedToolNames('plan').has('executeCommand'));
});

test('getAllowedToolNames code returns exactly 12 tools', t => {
	const result = getAllowedToolNames('code');
	t.is(result.size, 12);
});

test('getAllowedToolNames code includes all tool names', t => {
	const result = getAllowedToolNames('code');
	t.true(result.has('readFile'));
	t.true(result.has('writeFile'));
	t.true(result.has('editFile'));
	t.true(result.has('executeCommand'));
	t.true(result.has('grepSearch'));
	t.true(result.has('globSearch'));
	t.true(result.has('listDir'));
	t.true(result.has('toolSearch'));
	t.true(result.has('webSearch'));
	t.true(result.has('askUserQuestion'));
	t.true(result.has('exitPlanMode'));
	t.true(result.has('todoWrite'));
});

test('getAllowedToolNames yolo returns exactly 12 tools', t => {
	const result = getAllowedToolNames('yolo');
	t.is(result.size, 12);
});

test('getAllowedToolNames yolo includes all tool names', t => {
	const result = getAllowedToolNames('yolo');
	t.true(result.has('readFile'));
	t.true(result.has('writeFile'));
	t.true(result.has('editFile'));
	t.true(result.has('executeCommand'));
	t.true(result.has('grepSearch'));
	t.true(result.has('globSearch'));
	t.true(result.has('listDir'));
	t.true(result.has('toolSearch'));
	t.true(result.has('webSearch'));
	t.true(result.has('askUserQuestion'));
	t.true(result.has('exitPlanMode'));
	t.true(result.has('todoWrite'));
});

test('getAllowedToolNames code and yolo return equivalent tool sets', t => {
	const codeTools = getAllowedToolNames('code');
	const yoloTools = getAllowedToolNames('yolo');
	t.is(codeTools.size, yoloTools.size);
	for (const tool of codeTools) {
		t.true(yoloTools.has(tool));
	}
});

test('getAllowedToolNames plan is a subset of code tools', t => {
	const planTools = getAllowedToolNames('plan');
	const codeTools = getAllowedToolNames('code');
	for (const tool of planTools) {
		t.true(codeTools.has(tool));
	}
});

test('getAllowedToolNames returns fallback tool set for unknown mode via type cast', t => {
	const result = getAllowedToolNames('invalid-mode' as Mode);
	t.is(result.size, 9);
	t.false(result.has('writeFile'));
});

test('getPreStatLimit includes offset for paginated grepSearch stat candidates', t => {
	t.is(getPreStatLimit(10, 5), 15);
	t.is(getPreStatLimit(undefined, 5), 255);
	t.is(getPreStatLimit(0, 5), undefined);
});

test('applyHeadLimit uses headLimit plus offset candidate window for grepSearch', t => {
	const matches = ['a', 'b', 'c', 'd'];
	const preStatLimit = getPreStatLimit(1, 1);

	t.deepEqual(applyHeadLimit(matches, preStatLimit).items, ['a', 'b']);
	t.deepEqual(applyHeadLimit(matches, 1, 1), {
		items: ['b'],
		appliedLimit: 1,
		wasTruncated: true,
	});
});
