import React, {useState, useCallback, useEffect} from 'react';
import {Box, useInput} from 'ink';
import type {UIMessage} from 'ai';
import AppFooter from './components/app-footer.js';
import AppHeader from './components/app-header.js';
import ComposerPanel from './components/composer-panel.js';
import ConversationPanel from './components/conversation-panel.js';
import {useAgent} from './hooks/useAgent.js';
import type {Mode} from './utils/permissions.js';
import {formatUiPerfDuration, logUiPerf} from './utils/ui-perf.js';

type AppProps = {
	readonly mode?: Mode;
	readonly sessionId?: string;
	readonly initialMessages?: UIMessage[];
};

const modeOrder: Mode[] = ['plan', 'code', 'yolo'];

/**
 * Root Ink React component that manages the chat UI, agent integration, mode switching, and interactive tool prompts.
 *
 * Renders messages, a loading indicator, global errors, either an interactive prompt (when a tool interaction is active)
 * or a free-text input, and a bottom bar showing the current mode and status.
 *
 * @param mode - The initial operation mode (`'plan' | 'code' | 'yolo'`). Defaults to `'code'`.
 * @returns The rendered CLI application UI.
 */
export default function App({
	mode: initialMode = 'code',
	sessionId,
	initialMessages,
}: AppProps) {
	const [mode, setMode] = useState<Mode>(initialMode);
	const [interactionError, setInteractionError] = useState<string | undefined>(
		undefined,
	);
	const {
		transcriptStore,
		isLoading,
		error,
		sendMessage,
		pendingInteraction,
		submitToolApproval,
		submitToolOutput,
	} = useAgent(mode, {sessionId, initialMessages});

	const hasPendingInteraction = pendingInteraction !== undefined;

	useEffect(() => {
		setInteractionError(undefined);
	}, [pendingInteraction]);

	useInput((keyInput, key) => {
		const isShiftTab = keyInput === '\u001B[Z' || (key.tab && key.shift);
		const isTab = key.tab && !key.shift;

		if (!isTab && !isShiftTab) {
			return;
		}

		if (isLoading || hasPendingInteraction) {
			return;
		}

		setMode(previousMode => {
			const currentIndex = modeOrder.indexOf(previousMode);
			if (currentIndex === -1) {
				return previousMode;
			}

			const nextIndex = isShiftTab
				? (currentIndex - 1 + modeOrder.length) % modeOrder.length
				: (currentIndex + 1) % modeOrder.length;

			const nextMode = modeOrder[nextIndex];
			if (nextMode && nextMode !== previousMode) {
				logUiPerf('mode_switch', {
					from: previousMode,
					to: nextMode,
				});
			}

			return nextMode ?? previousMode;
		});
	});

	const handleSubmit = useCallback(
		(value: string) => {
			if (isLoading || hasPendingInteraction) {
				return;
			}

			const startedAt = performance.now();
			void sendMessage(value);
			logUiPerf('send_message_requested', {
				enqueueMs: formatUiPerfDuration(performance.now() - startedAt),
				messageLength: value.length,
			});
		},
		[hasPendingInteraction, isLoading, sendMessage],
	);

	const handleApproval = useCallback(
		async (approved: boolean) => {
			if (pendingInteraction?.kind !== 'approval') {
				return;
			}

			setInteractionError(undefined);

			const nextMode =
				approved && pendingInteraction.toolName === 'exitPlanMode'
					? pendingInteraction.targetMode ?? 'code'
					: mode;

			try {
				await submitToolApproval({
					messageId: pendingInteraction.messageId,
					toolCallId: pendingInteraction.toolCallId,
					approvalId: pendingInteraction.approvalId,
					approved,
					overrideMode: nextMode,
				});

				if (approved && pendingInteraction.toolName === 'exitPlanMode') {
					setMode(nextMode);
				}
			} catch (error: unknown) {
				console.error('Failed to submit tool approval', error);
				setInteractionError('Failed to submit approval. Please try again.');
			}
		},
		[mode, pendingInteraction, submitToolApproval],
	);

	const handleQuestionAnswer = useCallback(
		async (selectedOptionIds: string[]) => {
			if (pendingInteraction?.kind !== 'question') {
				return;
			}

			setInteractionError(undefined);

			const selectedLabels = pendingInteraction.options
				.filter(option => selectedOptionIds.includes(option.id))
				.map(option => option.label);

			try {
				await submitToolOutput({
					messageId: pendingInteraction.messageId,
					toolCallId: pendingInteraction.toolCallId,
					output: {
						selectedOptionIds,
						selectedLabels,
					},
				});
			} catch (error: unknown) {
				console.error('Failed to submit tool output', error);
				setInteractionError('Failed to submit response. Please try again.');
			}
		},
		[pendingInteraction, submitToolOutput],
	);

	return (
		<Box flexDirection="column" paddingTop={0}>
			<AppHeader />
			<ConversationPanel
				transcriptStore={transcriptStore}
				isLoading={isLoading}
				error={error}
			/>
			<ComposerPanel
				pendingInteraction={pendingInteraction}
				isLoading={isLoading}
				interactionError={interactionError}
				onSubmitMessage={handleSubmit}
				onApprove={handleApproval}
				onSubmitAnswer={handleQuestionAnswer}
			/>
			<AppFooter mode={mode} hasPendingInteraction={hasPendingInteraction} />
		</Box>
	);
}
