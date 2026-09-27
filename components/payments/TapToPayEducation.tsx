import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TAP_TO_PAY_ON_IPHONE } from '@/lib/payments/tap-to-pay-copy';
import { spacing } from '@/theme/index';

/**
 * The app's own Tap to Pay on iPhone merchant education.
 *
 * On iOS 18 and later Apple's education (`ProximityReaderDiscovery`, via the
 * `tap-to-pay-education` module) is shown instead, as Apple requires. This is the
 * fallback for iOS 16.4–17, or when Apple's content cannot be loaded, and covers
 * what the checklist asks merchant education to cover: contactless cards (4.5),
 * Apple Pay and other wallets (4.6), PIN entry and its accessibility options
 * (4.7), and what to do when a card cannot be read (4.8).
 */
const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Take a contactless card',
    body: `Open the appointment, tap Take payment, then ${TAP_TO_PAY_ON_IPHONE}. Ask your client to hold their card flat against the top of your iPhone until they see Done.`,
  },
  {
    title: 'Apple Pay and other digital wallets',
    body: 'Your client holds their iPhone, Apple Watch or other phone near the top of your iPhone and confirms the payment on their own device.',
  },
  {
    title: 'When the card asks for a PIN',
    body: 'Hand your iPhone to your client so they can enter their PIN on screen. The PIN screen has accessibility options, including VoiceOver, for clients who need them.',
  },
  {
    title: "If a card can't be read",
    body: 'Try the tap again. If it still fails, take the payment another way: insert the card into your card reader if you have one, or record a cash or other payment.',
  },
];

export function TapToPayEducationContent() {
  return (
    <View style={styles.sections}>
      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text variant="label">{section.title}</Text>
          <Text variant="bodySmall" tone="muted">
            {section.body}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The education as its own sheet, for Settings. */
export function TapToPayEducationSheet({
  visible,
  onClose,
  action,
}: {
  visible: boolean;
  onClose: () => void;
  /**
   * Apple's guidance: end the tutorial with a way to accept the terms for a
   * merchant who has not yet. Passed by callers only when that applies.
   */
  action?: ReactNode;
}) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.body}>
        <View style={styles.header}>
          <Text variant="overline" tone="muted">
            In-person payments
          </Text>
          <Text variant="title">How to use {TAP_TO_PAY_ON_IPHONE}</Text>
        </View>
        <TapToPayEducationContent />
        {action}
        <Button label="Done" variant={action ? 'secondary' : 'primary'} onPress={onClose} fullWidth />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  sections: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.xs,
  },
});
