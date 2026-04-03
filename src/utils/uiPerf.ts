const UI_PERF_ENABLED = process.env['AMAN_CODE_UI_PERF'] === '1';

function round(value: number): number {
	return Number(value.toFixed(2));
}

export function formatUiPerfDuration(durationMs: number): number {
	return round(durationMs);
}

export function logUiPerf(
	event: string,
	details: Record<string, number | string | boolean | null | undefined> = {},
): void {
	if (!UI_PERF_ENABLED) {
		return;
	}

	console.error(
		`[ui-perf] ${event} ${JSON.stringify({
			...details,
			timestampMs: round(performance.now()),
		})}`,
	);
}
