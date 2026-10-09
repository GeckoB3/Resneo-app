import { useState } from 'react';
import type { KeyboardTypeOptions } from 'react-native';

import { Input } from '@/components/ui/Input';

/**
 * A number typed as text (the web's `<input type="number">` with its clamp). The typed text is kept
 * while typing, so "12" can be typed past a clamp of "1" to 2; `parse` turns it into the value, or
 * `undefined` to leave the value as it is. Leaving the field shows the value it settled on. A new
 * `value` from outside (a reload, a discard) replaces the text.
 */
export function NumberTextField({
  value,
  toText,
  parse,
  onChange,
  accessibilityLabel,
  keyboardType = 'number-pad',
}: {
  value: number | null;
  toText: (value: number | null) => string;
  parse: (text: string) => number | null | undefined;
  onChange: (value: number | null) => void;
  accessibilityLabel: string;
  keyboardType?: KeyboardTypeOptions;
}) {
  const [text, setText] = useState(() => toText(value));
  const [seen, setSeen] = useState<number | null>(value);
  if (value !== seen) {
    setSeen(value);
    if (parse(text) !== value) setText(toText(value));
  }
  return (
    <Input
      value={text}
      onChangeText={(next) => {
        setText(next);
        const parsed = parse(next);
        if (parsed === undefined) return;
        setSeen(parsed);
        onChange(parsed);
      }}
      onBlur={() => setText(toText(value))}
      keyboardType={keyboardType}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
