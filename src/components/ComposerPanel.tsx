import React, {memo, useCallback, useEffect, useRef, useState} from 'react';
import {Box, Text} from 'ink';
import TextInput from 'ink-text-input';
import InteractivePrompt from './InteractivePrompt.js';
import type {PendingInteraction} from '../hooks/useAgent.js';
import {formatUiPerfDuration, logUiPerf} from '../utils/uiPerf.js';

interface ComposerPanelProps {
	pendingInteraction: PendingInteraction | null;
	isLoading: boolean;
	interactionError: string | null;
	onSubmitMessage: (value: string) => void;
	onApprove: (approved: boolean) => void | Promise<void>;
	onSubmitAnswer: (selectedOptionIds: string[]) => void | Promise<void>;
}

function ComposerPanel({
	pendingInteraction,
	isLoading,
	interactionError,
	onSubmitMessage,
	onApprove,
	onSubmitAnswer,
}: ComposerPanelProps) {
	const [input, setInput] = useState('');
	const lastInputAtRef = useRef<number | null>(null);

	useEffect(() => {
		if (pendingInteraction) {
			setInput('');
		}
	}, [pendingInteraction]);

	const handleChange = useCallback((value: string) => {
		const now = performance.now();
		const previousInputAt = lastInputAtRef.current;
		lastInputAtRef.current = now;

		if (previousInputAt != null) {
			logUiPerf('input_change', {
				deltaMs: formatUiPerfDuration(now - previousInputAt),
				length: value.length,
			});
		}

		setInput(value);
	}, []);

	const handleSubmit = useCallback(
		(value: string) => {
			const trimmed = value.trim();
			if (!trimmed || isLoading || pendingInteraction) {
				return;
			}

			const now = performance.now();
			const previousInputAt = lastInputAtRef.current;
			lastInputAtRef.current = null;

			logUiPerf('input_submit', {
				idleMs:
					previousInputAt == null
						? undefined
						: formatUiPerfDuration(now - previousInputAt),
				length: trimmed.length,
			});

			setInput('');
			onSubmitMessage(trimmed);
		},
		[isLoading, onSubmitMessage, pendingInteraction],
	);

	if (pendingInteraction) {
		return (
			<Box flexDirection="column">
				<InteractivePrompt
					interaction={pendingInteraction}
					onApprove={onApprove}
					onSubmitAnswer={onSubmitAnswer}
					disabled={isLoading}
				/>
				{interactionError && (
					<Box marginTop={1}>
						<Text color="red">{interactionError}</Text>
					</Box>
				)}
			</Box>
		);
	}

	return (
		<Box
			borderStyle="bold"
			borderLeft={false}
			borderRight={false}
			flexDirection="row"
		>
			<Text> ❯ </Text>
			<TextInput
				value={input}
				onChange={handleChange}
				onSubmit={handleSubmit}
				placeholder={
					isLoading ? 'Waiting for response...' : 'Ask me anything...'
				}
			/>
		</Box>
	);
}

export default memo(ComposerPanel);
