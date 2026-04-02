import React from 'react';
import test from 'ava';
import {render} from 'ink-testing-library';
import App from './src/app.js';

test('renders with default mode', t => {
	const {lastFrame} = render(<App />);
	// App renders without error with default mode
	t.true(lastFrame()?.includes('aman-code'));
});

test('renders with plan mode', t => {
	const {lastFrame} = render(<App mode="plan" />);
	// App renders without error with plan mode
	t.true(lastFrame()?.includes('aman-code'));
});
