import React, { useState, useCallback, useEffect } from 'react';
import { Box, Spacer, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import InteractivePrompt from './components/InteractivePrompt.js';
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
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    pendingInteraction,
    submitToolApproval,
    submitToolOutput,
  } = useAgent(mode);

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
      return nextMode ?? previousMode;
    });
  });

  const handleSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || isLoading || hasPendingInteraction) {
        return;
      }

      setInput('');
      void sendMessage(trimmed);
    },
    [hasPendingInteraction, isLoading, sendMessage],
  );

  const handleApproval = useCallback(
    async (approved: boolean) => {
      if (pendingInteraction?.kind !== 'approval') {
        return;
      }

      setInteractionError(null);

      const nextMode = approved && pendingInteraction.toolName === 'exitPlanMode'
        ? pendingInteraction.targetMode ?? 'code'
        : mode;

      if (approved && pendingInteraction.toolName === 'exitPlanMode') {
        setMode(nextMode);
      }

      try {
        await submitToolApproval({
          messageId: pendingInteraction.messageId,
          toolCallId: pendingInteraction.toolCallId,
          approvalId: pendingInteraction.approvalId,
          approved,
          overrideMode: nextMode,
        });
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
        .filter((option) => selectedOptionIds.includes(option.id))
        .map((option) => option.label);

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
        <Box marginBottom={1} marginTop={1} marginLeft={1}>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text dimColor> Thinking...</Text>
        </Box>
      )}

      {/* Error display */}
      {error && (
        <Box marginBottom={1} marginTop={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {pendingInteraction ? (
        <Box flexDirection="column">
          <InteractivePrompt
            interaction={pendingInteraction}
            onApprove={handleApproval}
            onSubmitAnswer={handleQuestionAnswer}
            disabled={isLoading}
          />
          {interactionError && (
            <Box marginTop={1}>
              <Text color="red">{interactionError}</Text>
            </Box>
          )}
        </Box>
      ) : (
        <Box
          borderStyle="bold"
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
      )}

      {/* Bottom bar */}
      <Box paddingLeft={1} paddingRight={1}>
        <ModeIndicator mode={mode} />
        <Spacer />
        <Text>
          {hasPendingInteraction
            ? 'Interactive tool active • Complete the prompt to continue'
            : 'Tab/Shift+Tab to change mode • Ctrl+C to exit'}
        </Text>
      </Box>
    </Box>
  );
}