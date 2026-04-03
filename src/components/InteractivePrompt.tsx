import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import type {PendingInteraction} from '../hooks/useAgent.js';

interface InteractivePromptProps {
	interaction: PendingInteraction;
	onApprove: (approved: boolean) => void | Promise<void>;
	onSubmitAnswer: (selectedOptionIds: string[]) => void | Promise<void>;
	disabled?: boolean;
}

/**
 * Renders an Ink-based interactive terminal prompt for either an approval confirmation or a selectable question.
 *
 * @param interaction - The pending interaction that defines prompt kind, question text, options, whether multiple selection is allowed, and optional detail
 * @param onApprove - Callback invoked with `true` for approval or `false` for denial when an approval prompt is submitted
 * @param onSubmitAnswer - Callback invoked with the array of selected option IDs when a question prompt is submitted
 * @param disabled - When `true`, disables input handling (defaults to `false`)
 * @returns The rendered Ink UI element for the interactive prompt
 */
export default function InteractivePrompt({
	interaction,
	onApprove,
	onSubmitAnswer,
	disabled = false,
}: InteractivePromptProps) {
	const [cursor, setCursor] = useState(0);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		setCursor(0);
		setSelectedIds([]);
		setSubmitting(false);
	}, [interaction]);

	const options = useMemo(() => {
		if (interaction.kind === 'approval') {
			return [
				{
					id: 'approve',
					label: 'Approve',
					description: 'Continue the tool flow.',
				},
				{
					id: 'deny',
					label: 'Deny',
					description: 'Stop this action and let the agent respond.',
				},
			];
		}

		return interaction.options;
	}, [interaction]);

	useInput(
		(input, key) => {
			if (disabled || options.length === 0) {
				return;
			}

			if (key.upArrow || input === 'k') {
				setCursor(current => (current - 1 + options.length) % options.length);
				return;
			}

			if (key.downArrow || input === 'j') {
				setCursor(current => (current + 1) % options.length);
				return;
			}

			if (
				interaction.kind === 'question' &&
				interaction.allowMultiple &&
				input === ' '
			) {
				const option = options[cursor];
				if (!option) {
					return;
				}

				setSelectedIds(current =>
					current.includes(option.id)
						? current.filter(id => id !== option.id)
						: [...current, option.id],
				);
				return;
			}

			if (key.return) {
				if (submitting) {
					return;
				}

				if (interaction.kind === 'approval') {
					const option = options[cursor];
					if (!option) {
						return;
					}

					setSubmitting(true);
					void (async () => {
						try {
							await onApprove(option.id !== 'deny');
						} catch {
							setSubmitting(false);
						}
					})();
					return;
				}

				const option = options[cursor];
				if (!option) {
					return;
				}

				const answer = interaction.allowMultiple
					? selectedIds.length > 0
						? selectedIds
						: [option.id]
					: [option.id];

				setSubmitting(true);
				void (async () => {
					try {
						await onSubmitAnswer(answer);
					} catch {
						setSubmitting(false);
					}
				})();
			}
		},
		{isActive: !disabled && !submitting},
	);

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			paddingX={1}
			paddingY={0}
			marginTop={1}
		>
			<Text bold color="cyan">
				{interaction.kind === 'approval'
					? 'Confirmation required'
					: 'User input required'}
			</Text>
			<Text>{interaction.question}</Text>
			{interaction.kind === 'approval' && interaction.detail ? (
				<Text dimColor>{interaction.detail}</Text>
			) : null}
			<Box flexDirection="column" marginTop={1}>
				{options.map((option, index) => {
					const isFocused = index === cursor;
					const isSelected = selectedIds.includes(option.id);
					const marker =
						interaction.kind === 'question' && interaction.allowMultiple
							? isSelected
								? '[x]'
								: '[ ]'
							: isFocused
							? '❯'
							: ' ';

					const hasDescription =
						typeof option.description === 'string' &&
						option.description.length > 0;

					return (
						<Box
							key={option.id}
							flexDirection="column"
							marginBottom={hasDescription ? 1 : 0}
						>
							<Text color={isFocused ? 'green' : undefined}>
								{marker} {option.label}
							</Text>
							{hasDescription ? (
								<Text dimColor>{option.description}</Text>
							) : null}
						</Box>
					);
				})}
			</Box>
			<Text dimColor>
				{interaction.kind === 'question' && interaction.allowMultiple
					? '↑/↓ to move • Space to toggle • Enter to submit'
					: '↑/↓ to move • Enter to submit'}
			</Text>
		</Box>
	);
}
