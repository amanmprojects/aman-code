export const EXIT_PLAN_MODE_TOOL_NAME = 'exitPlanMode';

/**
 * Renders the exitPlanMode tool description with detailed usage instructions.
 */
export function getExitPlanModeDescription(): string {
	return `Ask the user to confirm leaving plan mode and beginning implementation work.

Usage:
- Use this tool when you have completed planning and are ready to start implementation
- The planSummary parameter is a short summary of the plan or next implementation step
- The targetMode parameter specifies which mode to switch to: 'code' (default) or 'yolo'
- Only available in plan mode - this tool is blocked in code and yolo modes
- This is an interactive tool that requires user approval before switching modes`;
}
