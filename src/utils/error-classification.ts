type MalformedToolArgsError = 'malformed-tool-args';

const malformedJsonPatterns = [
	/json parsing failed/i,
	/expected\s+(a\s+)?valid\s+json\s+object/i,
	/expected\s+double-quoted\s+property\s+name/i,
	/invalid\s+json/i,
	/syntaxexception.*unexpected\s+token/i,
] as const;

export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === 'string') {
		return error;
	}

	try {
		const result = JSON.stringify(error);
		if (result !== undefined) {
			return result;
		}
	} catch {
		// Fall through to fallback
	}

	return String(error);
}

export function classifyError(
	error: unknown,
): MalformedToolArgsError | undefined {
	const message = getErrorMessage(error);

	for (const pattern of malformedJsonPatterns) {
		if (pattern.test(message)) {
			return 'malformed-tool-args';
		}
	}

	return undefined;
}

export type ErrorClassification = MalformedToolArgsError | undefined;
