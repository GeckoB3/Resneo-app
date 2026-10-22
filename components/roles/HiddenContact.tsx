import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';

import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { ROLES_COPY } from '@/lib/roles/roles';
import type { TypographyVariant } from '@/theme/index';

/**
 * A client's phone or email for someone whose "Can see client phone numbers and emails" is off (web
 * roles plan §5.6, Appendix C): the word "Hidden", with the tip read out by screen readers and, where
 * there is room, shown underneath. No call, text, email, WhatsApp or copy action goes with it.
 */
export const HIDDEN_CONTACT_LABEL = ROLES_COPY['contact.hidden'];
export const HIDDEN_CONTACT_TIP = ROLES_COPY['contact.hidden.tip'];

export function HiddenContactValue({
  variant = 'body',
  showTip = false,
  style,
  label,
}: {
  variant?: TypographyVariant;
  /** Show the tip as a line underneath (detail screens); lists keep to the one word. */
  showTip?: boolean;
  style?: StyleProp<TextStyle>;
  /** What is hidden ("Phone", "Email"), for screen readers. */
  label?: string;
}) {
  const word = (
    <Text
      variant={variant}
      tone="muted"
      style={style}
      accessibilityLabel={label ? `${label}: ${HIDDEN_CONTACT_LABEL}` : HIDDEN_CONTACT_LABEL}
      accessibilityHint={HIDDEN_CONTACT_TIP}>
      {HIDDEN_CONTACT_LABEL}
    </Text>
  );
  if (!showTip) return word;
  return (
    <View style={styles.withTip}>
      {word}
      <Text variant="caption" tone="muted">
        {HIDDEN_CONTACT_TIP}
      </Text>
    </View>
  );
}

/**
 * A phone or email field that cannot be changed because it is hidden: read-only, reading "Hidden",
 * with the tip as its helper line. Used in the client edit sheet and for a picked client in the
 * booking forms.
 */
export function HiddenContactField({ label }: { label: string }) {
  return (
    <Input
      label={label}
      value={HIDDEN_CONTACT_LABEL}
      editable={false}
      helper={HIDDEN_CONTACT_TIP}
      accessibilityHint={HIDDEN_CONTACT_TIP}
    />
  );
}

const styles = StyleSheet.create({
  withTip: {
    gap: 2,
  },
});
