import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type DimensionValue,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Cap the sheet height (default 90%). */
  maxHeight?: DimensionValue;
  /**
   * Tall mode: pin the sheet to a fixed `maxHeight` and let the content fill it
   * (the child manages its own scrolling + horizontal padding). Use for screens
   * that need to show a long, scrollable body — e.g. the full booking detail.
   */
  fill?: boolean;
  children: ReactNode;
};

/**
 * Bottom sheet — the one Modal-based sheet used across the app. Theme-aware
 * scrim, drag handle, bottom safe area and keyboard avoidance; callers supply
 * the content (header, scroll body, actions).
 */
export function Sheet({ visible, onClose, maxHeight = '90%', fill = false, children }: SheetProps) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.root, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <SafeAreaView
          edges={['bottom']}
          style={[
            styles.sheet,
            { backgroundColor: colors.surfaceRaised },
            fill ? { height: maxHeight } : { maxHeight },
          ]}>
          <View style={fill ? styles.contentFill : styles.content}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            {children}
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.surface,
    borderTopRightRadius: radius.surface,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  contentFill: {
    flex: 1,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.full,
  },
});
