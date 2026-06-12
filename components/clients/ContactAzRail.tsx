import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

import { AZ_LETTERS, NON_ALPHA_BUCKET } from './contactListData';

type ContactAzRailProps = {
  /** Letters that actually have rows loaded — others render dimmed/disabled. */
  presentLetters: Set<string>;
  /** Jump the list to this letter's header row. */
  onJump: (letter: string) => void;
  /** Extra bottom inset so the rail clears the home indicator / bulk bar. */
  bottomInset?: number;
};

/**
 * Right-edge A–Z jump rail. Tapping a letter scrolls the flattened contacts
 * FlatList to that letter's sticky header. Letters with no loaded rows are
 * shown dimmed and are not tappable. Each letter exposes an accessibility
 * label; the strip as a whole sits in a 44pt-wide hit area.
 */
function ContactAzRailBase({ presentLetters, onJump, bottomInset = 0 }: ContactAzRailProps) {
  const { colors } = useTheme();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { bottom: bottomInset }]}
      accessibilityRole="toolbar"
      accessibilityLabel="Jump to letter">
      <View style={[styles.rail, { backgroundColor: colors.surfaceSunken, borderColor: colors.border }]}>
        {AZ_LETTERS.map((letter) => {
          const present = presentLetters.has(letter);
          const label = letter === NON_ALPHA_BUCKET ? 'Other' : letter;
          return (
            <Pressable
              key={letter}
              disabled={!present}
              hitSlop={{ left: 12, right: 6, top: 2, bottom: 2 }}
              onPress={() => {
                hapticSelect();
                onJump(letter);
              }}
              accessibilityRole="button"
              accessibilityState={{ disabled: !present }}
              accessibilityLabel={`Jump to ${label}`}
              style={styles.letterHit}>
              <Text
                variant="caption"
                color={present ? colors.brand : colors.textMuted}
                style={[styles.letter, present ? undefined : styles.letterDim]}>
                {letter}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export const ContactAzRail = memo(ContactAzRailBase);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rail: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  letterHit: {
    paddingHorizontal: 4,
    minWidth: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  letterDim: {
    opacity: 0.4,
  },
});
