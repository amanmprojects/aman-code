export const DEFAULT_HEAD_LIMIT = 250;

export function applyHeadLimit<T>(
	items: T[],
	limit: number | undefined,
	offset: number = 0,
): {items: T[]; appliedLimit: number | undefined; wasTruncated: boolean} {
	if (limit === 0) {
		return {
			items: items.slice(offset),
			appliedLimit: undefined,
			wasTruncated: false,
		};
	}

	const effectiveLimit = limit ?? DEFAULT_HEAD_LIMIT;
	const sliced = items.slice(offset, offset + effectiveLimit);
	const wasTruncated = items.length - offset > effectiveLimit;
	return {
		items: sliced,
		appliedLimit: wasTruncated ? effectiveLimit : undefined,
		wasTruncated,
	};
}

export function getPreStatLimit(
	limit: number | undefined,
	offset: number = 0,
): number | undefined {
	if (limit === 0) {
		return undefined;
	}

	return (limit ?? DEFAULT_HEAD_LIMIT) + offset;
}
