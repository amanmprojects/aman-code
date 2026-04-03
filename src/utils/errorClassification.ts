type MalformedToolArgsError = 'malformed-tool-args';

const MALFORMED_JSON_PATTERNS = [
	/JSON parsing failed/i,
	/Expected\s+(a\s+)?valid\s+JSON\s+object/i,
	/Expected\s+double-quoted\s+property\s+name/i,
	/Invalid\s+JSON/i,
	/SyntaxException.*Unexpected\s+token/i,
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
		// fall through to fallback
	}
	return String(error);
}

export function classifyError(error: unknown): MalformedToolArgsError | null {
	const message = getErrorMessage(error);

	for (const pattern of MALFORMED_JSON_PATTERNS) {
		if (pattern.test(message)) {
			return 'malformed-tool-args';
		}
	}

	return null;
}

export type ErrorClassification = MalformedToolArgsError | null;
