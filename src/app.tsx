import React, {useState, useCallback, useEffect} from 'react';
import {Box, useInput} from 'ink';
import AppFooter from './components/AppFooter.js';
import AppHeader from './components/AppHeader.js';
import ComposerPanel from './components/ComposerPanel.js';
import ConversationPanel from './components/ConversationPanel.js';
import {useAgent} from './hooks/useAgent.js';
import type {Mode} from './utils/permissions.js';
import {formatUiPerfDuration, logUiPerf} from './utils/uiPerf.js';

import type {UIMessage} from 'ai';

interface AppProps {
	mode?: Mode;
	sessionId?: string;
	initialMessages?: UIMessage[];
}

const MODE_ORDER: Mode[] = ['plan', 'code', 'yolo'];

/**
 * Root Ink React component that manages the chat UI, agent integration, mode switching, and interactive tool prompts.
 *
 * Renders messages, a loading indicator, global errors, either an interactive prompt (when a tool interaction is active)
 * or a free-text input, and a bottom bar showing the current mode and status.
 *
 * @param mode - The initial operation mode (`'plan' | 'code' | 'yolo'`). Defaults to `'code'`.
 * @returns The rendered CLI application UI.
 */
export default function App({mode: initialMode = 'code', sessionId, initialMessages}: AppProps) {
	const [mode, setMode] = useState<Mode>(initialMode);
	const [interactionError, setInteractionError] = useState<string | null>(null);
	const {
		transcriptStore,
		isLoading,
		error,
		sendMessage,
		pendingInteraction,
		submitToolApproval,
		submitToolOutput,
	} = useAgent(mode, {sessionId, initialMessages});

	const hasPendingInteraction = pendingInteraction != null;

	useEffect(() => {
		setInteractionError(null);
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
			const currentIndex = MODE_ORDER.indexOf(previousMode);
			if (currentIndex === -1) {
				return previousMode;
			}

			const nextIndex = isShiftTab
				? (currentIndex - 1 + MODE_ORDER.length) % MODE_ORDER.length
				: (currentIndex + 1) % MODE_ORDER.length;

			const nextMode = MODE_ORDER[nextIndex];
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

			setInteractionError(null);

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
			} catch (error) {
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

			setInteractionError(null);

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
			} catch (error) {
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
