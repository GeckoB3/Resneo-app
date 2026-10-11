import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type TextStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { useReduceMotion } from '@/lib/motion';
import { clientColors, fonts, radius, spacing } from '@/theme/index';

/**
 * Client mode (POS test round 2026-10-11, Part 3; research `part3-tip-research.md` §6): the navy
 * surface a client sees from the moment staff hand the phone over until staff press Done. It runs
 * straight into the dark Tap to Pay screens (Apple's sheet, Stripe's Android screen) without a white
 * flash. Teal is the client's action; white is staff's.
 *
 * Text here may grow to twice its size (the app caps elsewhere at 1.3x); amounts to 1.2x.
 */

export const CLIENT_TEXT_SCALE = 2;
const AMOUNT_SCALE = 1.2;

export function ClientText({
  role,
  children,
  color,
  center = true,
  style,
  ...rest
}: {
  role: 'venue' | 'question' | 'title' | 'hero' | 'result' | 'body' | 'small' | 'option' | 'optionSub' | 'button';
  children: ReactNode;
  color?: string;
  center?: boolean;
  style?: TextStyle;
  accessibilityRole?: 'header' | 'text';
  accessibilityLiveRegion?: 'polite' | 'assertive' | 'none';
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
  testID?: string;
}) {
  const { height } = useWindowDimensions();
  const small = height < 700;
  const base: TextStyle = ROLE[role](small);
  const isAmount = role === 'hero' || role === 'result';
  return (
    <Text
      {...rest}
      maxFontSizeMultiplier={isAmount ? AMOUNT_SCALE : CLIENT_TEXT_SCALE}
      minimumFontScale={isAmount ? 0.6 : undefined}
      style={[base, { color: color ?? base.color, textAlign: center ? 'center' : 'left' }, style]}>
      {children}
    </Text>
  );
}

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };
const ROLE: Record<string, (small: boolean) => TextStyle> = {
  venue: () => ({ fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, color: clientColors.textSecondary }),
  question: (small) => ({
    fontFamily: fonts.bold,
    fontSize: small ? 24 : 28,
    lineHeight: small ? 30 : 34,
    letterSpacing: -0.3,
    color: clientColors.text,
  }),
  title: () => ({ fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.3, color: clientColors.text }),
  hero: (small) => ({
    ...tabular,
    fontFamily: fonts.extrabold,
    fontSize: small ? 48 : 56,
    lineHeight: small ? 56 : 64,
    letterSpacing: -1,
    color: clientColors.text,
  }),
  result: () => ({ ...tabular, fontFamily: fonts.extrabold, fontSize: 40, lineHeight: 48, color: clientColors.text }),
  body: () => ({ fontFamily: fonts.medium, fontSize: 17, lineHeight: 24, color: clientColors.textSecondary }),
  small: () => ({ fontFamily: fonts.regular, fontSize: 15, lineHeight: 20, color: clientColors.textSecondary }),
  option: () => ({ ...tabular, fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, color: clientColors.text }),
  optionSub: () => ({ ...tabular, fontFamily: fonts.medium, fontSize: 17, lineHeight: 22, color: clientColors.textSecondary }),
  button: () => ({ ...tabular, fontFamily: fonts.bold, fontSize: 20, lineHeight: 24, color: clientColors.onAccent }),
};

/** The venue the client is paying, as on Apple's sheet ("Pay {venue}"): logo tile and name. */
export function ClientVenue({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  const initial = name.trim().charAt(0).toUpperCase() || 'R';
  return (
    <View style={styles.venue} accessible accessibilityLabel={name}>
      {logoUrl ? (
        // A white tile, so a dark logo stays visible on navy.
        <View style={styles.logoTile}>
          <Image source={{ uri: logoUrl }} style={styles.logo} contentFit="contain" accessibilityIgnoresInvertColors />
        </View>
      ) : (
        <View style={[styles.logoTile, styles.initialTile]}>
          <Text style={styles.initial} maxFontSizeMultiplier={1}>
            {initial}
          </Text>
        </View>
      )}
      <ClientText role="venue" numberOfLines={1} center={false}>
        {name}
      </ClientText>
    </View>
  );
}

/**
 * The navy screen every client step draws in: the staff close top-left (when staff may stop here),
 * the venue in the middle of the top bar, a scrolling body and a pinned footer.
 */
export function ClientFrame({
  venueName,
  logoUrl,
  deep = false,
  onStaffClose,
  staffCloseLabel,
  children,
  footer,
  overlay,
  screenKey,
}: {
  venueName: string;
  logoUrl?: string | null;
  /** The deeper navy around the system card screen (getting ready, processing). */
  deep?: boolean;
  onStaffClose?: () => void;
  staffCloseLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Drawn over the screen (staff's stop panel). */
  overlay?: ReactNode;
  /** A new key cross-fades the body in. */
  screenKey?: string;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const side = width >= 414 ? spacing.xl : spacing.lg;
  return (
    <View
      style={[styles.frame, { backgroundColor: deep ? clientColors.bgDeep : clientColors.bg }]}
      accessibilityViewIsModal
      testID="client-mode">
      <StatusBar style="light" />
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm, paddingHorizontal: side }]}>
        <View style={styles.closeSlot}>
          {onStaffClose ? (
            <Pressable
              onPress={onStaffClose}
              accessibilityRole="button"
              accessibilityLabel={staffCloseLabel}
              hitSlop={8}
              style={({ pressed }) => [styles.close, pressed ? { backgroundColor: clientColors.pressedFill } : null]}>
              <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={16} tintColor={clientColors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.venueSlot}>
          <ClientVenue name={venueName} logoUrl={logoUrl} />
        </View>
        <View style={styles.closeSlot} />
      </View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.body, { paddingHorizontal: side }]}
        keyboardShouldPersistTaps="handled">
        <Animated.View
          key={screenKey}
          entering={reduceMotion ? undefined : FadeInDown.duration(200).withInitialValues({ transform: [{ translateY: 12 }] })}
          style={styles.bodyInner}>
          {children}
        </Animated.View>
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { paddingHorizontal: side, paddingBottom: insets.bottom + spacing.base }]}>{footer}</View>
      ) : (
        <View style={{ height: insets.bottom + spacing.base }} />
      )}
      {overlay}
    </View>
  );
}

type ButtonTone = 'client' | 'outline' | 'staff' | 'text' | 'neutral';

/** Client mode's buttons: teal for the client, white for staff, outlined or text for the rest. */
export function ClientButton({
  label,
  onPress,
  tone = 'client',
  disabled = false,
  loading = false,
  accessibilityLabel,
  testID,
}: {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const fill =
    tone === 'client'
      ? disabled
        ? clientColors.disabledFill
        : clientColors.accent
      : tone === 'staff'
        ? clientColors.staff
        : tone === 'neutral'
          ? clientColors.option
          : 'transparent';
  const color =
    tone === 'client'
      ? disabled
        ? clientColors.disabledText
        : clientColors.onAccent
      : tone === 'staff'
        ? clientColors.onStaff
        : tone === 'text'
          ? clientColors.textSecondary
          : clientColors.text;
  const height = tone === 'client' ? 64 : tone === 'text' ? 48 : 56;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        { minHeight: height, backgroundColor: fill },
        tone === 'outline' || tone === 'neutral' ? { borderWidth: 1.5, borderColor: clientColors.optionBorder } : null,
        pressed && !disabled ? { opacity: 0.85 } : null,
      ]}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text
          maxFontSizeMultiplier={CLIENT_TEXT_SCALE}
          style={[
            styles.buttonLabel,
            tone === 'text' ? { fontFamily: fonts.semibold, fontSize: 17 } : null,
            tone === 'client' ? { fontSize: 20 } : null,
            { color },
          ]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * The result ring: a tick for paid, "!" when the card did not go through, and a calm "i" when
 * something else stopped it (timed out, the desk, the team must check).
 */
export function ClientRing({ kind }: { kind: 'success' | 'error' | 'neutral' }) {
  const reduceMotion = useReduceMotion();
  const ring = kind === 'success' ? clientColors.success : kind === 'error' ? clientColors.error : clientColors.optionBorder;
  const icon: SymbolViewProps['name'] =
    kind === 'success'
      ? { ios: 'checkmark', android: 'check', web: 'check' }
      : kind === 'error'
        ? { ios: 'exclamationmark', android: 'priority_high', web: 'priority_high' }
        : { ios: 'info', android: 'info_i', web: 'info' };
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(450)}
      style={[styles.ring, { borderColor: ring }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden>
      <SymbolView name={icon} size={52} weight="bold" tintColor={clientColors.text} />
    </Animated.View>
  );
}

/**
 * Staff's "Stop this card payment?", drawn inside client mode (never a second Modal, which iOS
 * drops). Opened by the corner close and by Back.
 */
export function StaffStopPanel({
  title,
  body,
  keepLabel,
  stopLabel,
  onKeep,
  onStop,
}: {
  title: string;
  body: string;
  keepLabel: string;
  stopLabel: string;
  onKeep: () => void;
  onStop: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(150)}
      style={[StyleSheet.absoluteFill, styles.scrim]}
      accessibilityViewIsModal>
      <Pressable style={StyleSheet.absoluteFill} onPress={onKeep} accessibilityLabel={keepLabel} />
      <View style={[styles.stopPanel, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text variant="heading" style={styles.stopTitle} accessibilityRole="header">
          {title}
        </Text>
        <Text variant="bodySmall" style={styles.stopBody}>
          {body}
        </Text>
        <Pressable
          onPress={onKeep}
          accessibilityRole="button"
          style={({ pressed }) => [styles.stopKeep, pressed ? { opacity: 0.85 } : null]}>
          <Text style={[styles.buttonLabel, { color: '#FFFFFF' }]}>{keepLabel}</Text>
        </Pressable>
        <Pressable
          onPress={onStop}
          accessibilityRole="button"
          style={({ pressed }) => [styles.stopConfirm, pressed ? { opacity: 0.85 } : null]}>
          <Text style={[styles.buttonLabel, { color: '#B91C1C' }]}>{stopLabel}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingBottom: spacing.sm, gap: spacing.sm },
  closeSlot: { width: 44, height: 44 },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: clientColors.disabledFill,
  },
  venueSlot: { flex: 1, alignItems: 'center' },
  venue: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, maxWidth: '100%' },
  logoTile: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initialTile: { backgroundColor: clientColors.accent },
  initial: { fontFamily: fonts.bold, fontSize: 16, color: clientColors.onAccent },
  logo: { width: 28, height: 28 },
  body: { flexGrow: 1, paddingTop: spacing.base, paddingBottom: spacing.xl },
  bodyInner: { flexGrow: 1, gap: spacing.md },
  footer: { gap: spacing.md, paddingTop: spacing.md },
  button: {
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    alignSelf: 'stretch',
  },
  buttonLabel: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, textAlign: 'center' },
  ring: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  scrim: { backgroundColor: clientColors.staffScrim, justifyContent: 'flex-end' },
  stopPanel: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: radius.surface,
    borderTopRightRadius: radius.surface,
    padding: spacing.xl,
    gap: spacing.md,
  },
  stopTitle: { color: '#0F172A' },
  stopBody: { color: '#475569' },
  stopKeep: {
    minHeight: 52,
    borderRadius: radius.card,
    backgroundColor: clientColors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopConfirm: {
    minHeight: 52,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: '#B91C1C',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
