import React, {memo} from 'react';
import {Text} from 'ink';
import {marked} from 'marked';
import * as MarkedTerminalModule from 'marked-terminal';

type MarkdownProps = {
	readonly children: string;
	readonly cacheKey?: string;
};

const {markedTerminal} = MarkedTerminalModule as unknown as {
	markedTerminal: () => {
		renderer: Record<string, (...arguments_: unknown[]) => string>;
	};
};

const MAX_MARKDOWN_CACHE_ENTRIES = 200;
const markdownByPartCache = new Map<
	string,
	{source: string; rendered: string}
>();
const markdownByTextCache = new Map<string, string>();

marked.use(markedTerminal());

function updateCache<TValue>(
	cache: Map<string, TValue>,
	key: string,
	value: TValue,
): void {
	if (cache.has(key)) {
		cache.delete(key);
	}

	cache.set(key, value);

	if (cache.size > MAX_MARKDOWN_CACHE_ENTRIES) {
		const oldestKey = cache.keys().next().value;
		if (oldestKey != null) {
			cache.delete(oldestKey);
		}
	}
}

function renderMarkdown(source: string, cacheKey?: string): string {
	if (cacheKey) {
		const cachedPart = markdownByPartCache.get(cacheKey);
		if (cachedPart?.source === source) {
			return cachedPart.rendered;
		}
	}

	const cachedText = markdownByTextCache.get(source);
	if (cachedText != null) {
		if (cacheKey) {
			updateCache(markdownByPartCache, cacheKey, {
				source,
				rendered: cachedText,
			});
		}

		return cachedText;
	}

	const rendered = marked.parse(source, {async: false}).trim();
	updateCache(markdownByTextCache, source, rendered);

	if (cacheKey) {
		updateCache(markdownByPartCache, cacheKey, {
			source,
			rendered,
		});
	}

	return rendered;
}

function Markdown({children, cacheKey}: MarkdownProps) {
	return <Text>{renderMarkdown(children, cacheKey)}</Text>;
}

export default memo(
	Markdown,
	(previousProps, nextProps) =>
		previousProps.children === nextProps.children &&
		previousProps.cacheKey === nextProps.cacheKey,
);
