import React from 'react';
import { Box, Text } from "ink";

interface Part {
    type: string;
    text: string;
}

export default function UserMessage({ msg }: { msg: any }) {
    return (
        <Box key={msg.id} flexDirection='row' borderStyle='round' borderDimColor={true}>
            <Text color="green" bold>
                {'❯ '}
            </Text>
            <Text>{msg.parts.filter((p: Part) => p.type === 'text').map((p: Part) => p.text).join('')}</Text>
        </Box>
    );
}