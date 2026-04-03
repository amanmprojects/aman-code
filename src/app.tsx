import React, { useState, useCallback } from 'react';
import { Box, Spacer, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import MessageList from './components/MessageList.js';
import ModeIndicator from './components/ModeIndicator.js';
import { useAgent } from './hooks/useAgent.js';
import type { Mode } from './utils/permissions.js';
import BigText from 'ink-big-text';
import Divider from 'ink-divider';

interface AppProps {
  mode?: Mode;
}

const MODE_ORDER: Mode[] = ['plan', 'code', 'yolo'];

export default function App({ mode: initialMode = 'code' }: AppProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [input, setInput] = useState('');
  const { messages, isLoading, error, sendMessage } = useAgent(mode);

  useInput((keyInput, key) => {
    const isShiftTab = keyInput === '\u001B[Z' || (key.tab && key.shift);
    const isTab = key.tab && !key.shift;

    if (!isTab && !isShiftTab) {
      return;
    }

    if (isLoading) {
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
      return nextMode ?? previousMode;
    });
  });

  const handleSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || isLoading) {
        return;
      }

      setInput('');
      sendMessage(trimmed);
    },
    [isLoading, sendMessage],
  );

  return (
    <Box flexDirection="column" paddingTop={0}>
      {/* Header */}
      <Box marginBottom={1} flexDirection="column" height={12} flexShrink={0}>
        <Divider />
        <BigText text="aman-code" />
        <Divider />
      </Box>
      {/* Messages */}
      <MessageList messages={messages} />

      {/* Loading indicator */}
      {isLoading && messages.length > 0 && (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text dimColor> Thinking...</Text>
        </Box>
      )}

      {/* Error display */}
      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {/* Input */}
      <Box
        borderStyle="single"
        borderLeft={false}
        borderRight={false}
        flexDirection="row"
      >
        <Text> ❯ </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder={isLoading ? 'Waiting for response...' : 'Ask me anything...'}
        />
      </Box>

      {/* Bottom bar */}
      <Box paddingLeft={1} paddingRight={1}>
        <ModeIndicator mode={mode} />
        <Spacer />
        <Text>Tab/Shift+Tab to change mode • Ctrl+C to exit</Text>
      </Box>
    </Box>
  );
}