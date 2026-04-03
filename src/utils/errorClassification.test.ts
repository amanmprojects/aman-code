import test from 'ava';
import {getErrorMessage, classifyError} from './errorClassification.js';

test('getErrorMessage returns Error message for Error objects', t => {
	const error = new Error('Test error message');
	t.is(getErrorMessage(error), 'Test error message');
});

test('getErrorMessage returns string for string errors', t => {
	const error = 'String error message';
	t.is(getErrorMessage(error), 'String error message');
});

test('getErrorMessage returns JSON string for object errors', t => {
	const error = {code: 'TEST', message: 'Object error'};
	const result = getErrorMessage(error);
	t.true(result.includes('TEST'));
	t.true(result.includes('Object error'));
});

test('getErrorMessage returns string representation for unknown types', t => {
	const error = 123;
	t.is(getErrorMessage(error), '123');
});

test('getErrorMessage handles circular references gracefully', t => {
	const error: Record<string, unknown> = {};
	Object.defineProperty(error, 'self', {
		value: error,
		enumerable: true,
	});
	const result = getErrorMessage(error);
	t.is(result, '[object Object]');
});

test('classifyError detects JSON parsing failed pattern', t => {
	const error = new Error('JSON parsing failed: Unexpected token');
	t.is(classifyError(error), 'malformed-tool-args');
});

test('classifyError detects Expected a valid JSON object pattern', t => {
	const error = new Error('Expected a valid JSON object in the request');
	t.is(classifyError(error), 'malformed-tool-args');
});

test('classifyError detects Expected double-quoted property name pattern', t => {
	const error = new Error(
		'Expected double-quoted property name in JSON at position 45',
	);
	t.is(classifyError(error), 'malformed-tool-args');
});

test('classifyError detects Invalid JSON pattern', t => {
	const error = new Error('Invalid JSON supplied');
	t.is(classifyError(error), 'malformed-tool-args');
});

test('classifyError detects SyntaxException Unexpected token pattern', t => {
	const error = new Error(
		'SyntaxException: Unexpected token } in JSON at position 46',
	);
	t.is(classifyError(error), 'malformed-tool-args');
});

test('classifyError returns null for non-JSON errors', t => {
	const error = new Error('Some other error');
	t.is(classifyError(error), null);
});

test('classifyError is case insensitive for patterns', t => {
	const error1 = new Error('JSON PARSING FAILED');
	const error2 = new Error('json parsing failed');
	t.is(classifyError(error1), 'malformed-tool-args');
	t.is(classifyError(error2), 'malformed-tool-args');
});

test('classifyError works with string error messages', t => {
	const error = 'JSON parsing failed: Unexpected token';
	t.is(classifyError(error), 'malformed-tool-args');
});

test('classifyError works with object errors containing message', t => {
	const error = {message: 'Expected a valid JSON object'};
	t.is(classifyError(error), 'malformed-tool-args');
});
