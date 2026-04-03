import React, {memo} from 'react';
import {Box, Text} from 'ink';
import {parseDiff} from '../utils/diff.js';

interface DiffViewProps {
	diff: string;
}

function DiffView({diff}: DiffViewProps) {
	const lines = parseDiff(diff);

	if (lines.length === 0) {
		return <Text dimColor>No changes</Text>;
	}

	return (
		<Box flexDirection="column" paddingX={1}>
			{lines.map((line, i) => {
				switch (line.type) {
					case 'header':
						return (
							<Text key={i} color="cyan">
								{line.content}
							</Text>
						);
					case 'add':
						return (
							<Text key={i} color="green">
								{line.content}
							</Text>
						);
					case 'remove':
						return (
							<Text key={i} color="red">
								{line.content}
							</Text>
						);
					case 'context':
						return (
							<Text key={i} dimColor>
								{line.content}
							</Text>
						);
					default:
						return <Text key={i}>{line.content}</Text>;
				}
			})}
		</Box>
	);
}

export default memo(
	DiffView,
	(previousProps, nextProps) => previousProps.diff === nextProps.diff,
);
