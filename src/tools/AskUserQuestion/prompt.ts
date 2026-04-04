export const ASK_USER_QUESTION_TOOL_NAME = 'askUserQuestion';

/**
 * Renders the askUserQuestion tool description with detailed usage instructions.
 */
export function getAskUserQuestionDescription(): string {
	return `Ask the user a structured question with predefined options and wait for a selection before continuing.

Usage:
- Use this tool when you need the user to make a choice between specific options
- You can provide up to 8 options, each with a label and description
- NEVER include "other" as an option - the user can always automatically provide a custom response
- Set allowMultiple to true if the user should be able to select more than one option
- The question parameter is the main question text presented to the user
- Each option has: id (stable identifier), label (short display text), and optional description (longer explanation)`;
}