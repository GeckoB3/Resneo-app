import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { MAX_MESSAGE_CHARS } from '@/lib/assistant/client';
import { ASSISTANT_COPY } from '@/lib/assistant/copy';
import { spacing } from '@/theme/index';

export interface AssistantComposerProps {
  streaming: boolean;
  /** The venue cannot ask again today, or the assistant is switched off. */
  disabled: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

/**
 * The question box. Send while an answer is streaming becomes Stop, exactly as
 * on the web, so the one button is always the thing to press next.
 */
export function AssistantComposer({ streaming, disabled, onSend, onStop }: AssistantComposerProps) {
  const [text, setText] = useState('');
  const canSend = !streaming && !disabled && text.trim().length > 0;

  return (
    <View style={styles.row}>
      <Input
        value={text}
        onChangeText={(next) => setText(next.slice(0, MAX_MESSAGE_CHARS))}
        placeholder={ASSISTANT_COPY.placeholder}
        accessibilityLabel={ASSISTANT_COPY.placeholder}
        editable={!disabled}
        multiline
        maxLength={MAX_MESSAGE_CHARS}
        containerStyle={styles.field}
        style={styles.input}
      />
      {streaming ? (
        <Button label={ASSISTANT_COPY.stop} variant="secondary" onPress={onStop} />
      ) : (
        <Button
          label={ASSISTANT_COPY.send}
          disabled={!canSend}
          onPress={() => {
            if (!canSend) return;
            onSend(text);
            setText('');
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  field: {
    flex: 1,
  },
  input: {
    // Two lines of room without growing the bar on every screen.
    maxHeight: 120,
  },
});
