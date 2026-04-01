import React from 'react';
import { Box, Text } from 'ink';
import TextInput, { Props as TextInputProps } from 'ink-text-input';

export default function InputBox(props: TextInputProps) {
    return (
        <Box borderStyle='single' borderLeft={false} borderRight={false} flexDirection='row'>
            <Text>❯ </Text><TextInput {...props} />
        </Box>
    )
}