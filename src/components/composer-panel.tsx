import React, {memo, useCallback, useEffect, useRef, useState} from 'react';
import {Box, Text} from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import type {PendingInteraction} from '../hooks/useAgent.js';
import {formatUiPerfDuration, logUiPerf} from '../utils/ui-perf.js';
import InteractivePrompt from './interactive-prompt.js';

type ComposerPanelProps = {
	readonly pendingInteraction: PendingInteraction | undefined;
	readonly isLoading: boolean;
	readonly interactionError: string | undefined;
	readonly onSubmitMessage: (value: string) => void;
	readonly onApprove: (approved: boolean) => void | Promise<void>;
	readonly onSubmitAnswer: (
		selectedOptionIds: string[],
	) => void | Promise<void>;
};

function ComposerPanel({
	pendingInteraction,
	isLoading,
	interactionError,
	onSubmitMessage,
	onApprove,
	onSubmitAnswer,
}: ComposerPanelProps) {
	const [input, setInput] = useState('');
	const lastInputAtRef = useRef<number | undefined>(undefined);

	useEffect(() => {
		if (pendingInteraction) {
			setInput('');
		}
	}, [pendingInteraction]);

	const handleChange = useCallback((value: string) => {
		const now = performance.now();
		const previousInputAt = lastInputAtRef.current;
		lastInputAtRef.current = now;

		if (previousInputAt !== undefined) {
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
			lastInputAtRef.current = undefined;

			logUiPerf('input_submit', {
				idleMs:
					previousInputAt === undefined
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
					isDisabled={isLoading}
					onApprove={onApprove}
					onSubmitAnswer={onSubmitAnswer}
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
			<Text>
				{isLoading ? (
					<>
						{' '}
						<Spinner type="dots" />{' '}
					</>
				) : (
					' ❯ '
				)}
			</Text>
			<TextInput
				value={input}
				placeholder={
					isLoading ? 'Waiting for response...' : 'Ask me anything...'
				}
				onChange={handleChange}
				onSubmit={handleSubmit}
			/>
		</Box>
	);
}

export default memo(ComposerPanel);
