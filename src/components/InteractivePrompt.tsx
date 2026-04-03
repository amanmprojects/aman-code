import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { PendingInteraction } from '../hooks/useAgent.js';

interface InteractivePromptProps {
	interaction: PendingInteraction;
	onApprove: (approved: boolean) => void | Promise<void>;
	onSubmitAnswer: (selectedOptionIds: string[]) => void | Promise<void>;
	disabled?: boolean;
}

export default function InteractivePrompt({
	interaction,
	onApprove,
	onSubmitAnswer,
	disabled = false,
}: InteractivePromptProps) {
	const [cursor, setCursor] = useState(0);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);

	useEffect(() => {
		setCursor(0);
		setSelectedIds([]);
	}, [interaction]);

	const options = useMemo(() => {
		if (interaction.kind === 'approval') {
			return [
				{ id: 'approve', label: 'Approve', description: 'Continue the tool flow.' },
				{ id: 'deny', label: 'Deny', description: 'Stop this action and let the agent respond.' },
			];
		}

		return interaction.options;
	}, [interaction]);

	useInput((input, key) => {
		if (disabled || options.length === 0) {
			return;
		}

		if (key.upArrow || input === 'k') {
			setCursor((current) => (current - 1 + options.length) % options.length);
			return;
		}

		if (key.downArrow || input === 'j') {
			setCursor((current) => (current + 1) % options.length);
			return;
		}

		if (interaction.kind === 'question' && interaction.allowMultiple && input === ' ') {
			const option = options[cursor];
			if (!option) {
				return;
			}

			setSelectedIds((current) =>
				current.includes(option.id)
					? current.filter((id) => id !== option.id)
					: [...current, option.id],
			);
			return;
		}

		if (key.return) {
			if (interaction.kind === 'approval') {
				const option = options[cursor];
				if (!option) {
					return;
				}

				void onApprove(option.id !== 'deny');
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

			void onSubmitAnswer(answer);
		}
	});

	return (
		<Box flexDirection="column" borderStyle="round" paddingX={1} paddingY={0} marginTop={1}>
			<Text bold color="cyan">
				{interaction.kind === 'approval' ? 'Confirmation required' : 'User input required'}
			</Text>
			<Text>{interaction.question}</Text>
			{interaction.kind === 'approval' && interaction.detail ? (
				<Text dimColor>{interaction.detail}</Text>
			) : null}
			<Box flexDirection="column" marginTop={1}>
				{options.map((option, index) => {
					const isFocused = index === cursor;
					const isSelected = selectedIds.includes(option.id);
					const marker = interaction.kind === 'question' && interaction.allowMultiple
						? isSelected
							? '[x]'
							: '[ ]'
						: isFocused
							? '❯'
							: ' ';

					return (
						<Box key={option.id} flexDirection="column" marginBottom={option.description ? 1 : 0}>
							<Text color={isFocused ? 'green' : undefined}>
								{marker} {option.label}
							</Text>
							{option.description ? <Text dimColor>{option.description}</Text> : null}
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
