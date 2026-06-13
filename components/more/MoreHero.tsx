import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Defs, LinearGradient, RadialGradient, Rect, Stop, Svg } from 'react-native-svg';

import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { accent, brand, fonts, radius, spacing } from '@/theme/index';

/** Notification-badge red — pops against the navy hero in both themes. */
const BADGE_BG = '#FF4D4F';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type MoreHeroProps = {
  name: string;
  /** Venue name (or fallback email) shown under the staff name. */
  subtitle: string;
  /** "Admin" / "Staff" — rendered as a glassy pill. Hidden when empty. */
  roleLabel: string;
  /** Time-of-day greeting eyebrow, e.g. "Good morning". */
  greeting: string;
  unreadCount: number;
  onPressProfile: () => void;
  onPressNotifications: () => void;
};

/** Glassy circular bell with an unread-count badge. */
function BellButton({ count, onPress }: { count: number; onPress: () => void }) {
  const label = count > 0 ? `Notifications, ${count} unread` : 'Notifications';
  return (
    <PressableScale onPress={onPress} haptic accessibilityLabel={label} style={styles.bell}>
      <SymbolView
        name={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }}
        tintColor="#FFFFFF"
        size={18}
      />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? '99+' : String(count)}</Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

/**
 * Immersive identity header for the More tab — a navy→teal brand gradient panel
 * (SVG, with a soft teal glow) carrying the staff member's name, venue, role and
 * a notifications bell. The identity block taps through to Account settings.
 *
 * The gradient is painted by an absolutely-positioned <Svg> sized from onLayout
 * (the proven pattern in SvgLineChart); a solid navy base colour means there's
 * no flash before the first paint.
 */
export function MoreHero({
  name,
  subtitle,
  roleLabel,
  greeting,
  unreadCount,
  onPressProfile,
  onPressNotifications,
}: MoreHeroProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  function handleLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  }

  return (
    <View style={styles.hero} onLayout={handleLayout}>
      {size.width > 0 ? (
        <Svg width={size.width} height={size.height} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="moreHeroFill" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={brand[800]} />
              <Stop offset="0.5" stopColor={brand[600]} />
              <Stop offset="1" stopColor={accent[700]} />
            </LinearGradient>
            <RadialGradient id="moreHeroGlow" cx={0.86} cy={0.04} r={0.75}>
              <Stop offset="0" stopColor={accent[400]} stopOpacity={0.55} />
              <Stop offset="1" stopColor={accent[400]} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={size.width} height={size.height} fill="url(#moreHeroFill)" />
          <Rect x="0" y="0" width={size.width} height={size.height} fill="url(#moreHeroGlow)" />
        </Svg>
      ) : null}

      <View style={styles.topRow}>
        <Text variant="overline" style={styles.eyebrow}>
          {greeting}
        </Text>
        <BellButton count={unreadCount} onPress={onPressNotifications} />
      </View>

      <PressableScale
        onPress={onPressProfile}
        haptic
        accessibilityLabel="Account settings"
        accessibilityHint="Opens your profile and account settings"
        style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(name)}</Text>
        </View>
        <View style={styles.identityText}>
          <Text variant="title" color="#FFFFFF" numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.metaRow}>
            {subtitle ? (
              <Text variant="bodySmall" style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
            {roleLabel ? (
              <View style={styles.rolePill}>
                <Text style={styles.rolePillText}>{roleLabel}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          tintColor="rgba(255, 255, 255, 0.6)"
          size={16}
        />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.surface,
    backgroundColor: brand[600],
    overflow: 'hidden',
    minHeight: 150,
    padding: spacing.lg,
    gap: spacing.xl,
    justifyContent: 'space-between',
    // Brand-tinted lift so the panel floats off the white background.
    boxShadow: '0 14px 30px rgba(0, 59, 111, 0.30)',
    elevation: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: 'rgba(255, 255, 255, 0.78)',
  },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BADGE_BG,
    borderWidth: 2,
    borderColor: brand[700],
  },
  badgeText: {
    color: '#FFFFFF',
    fontFamily: fonts.bold,
    fontSize: 11,
    lineHeight: 14,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  avatarText: {
    color: '#FFFFFF',
    fontFamily: fonts.semibold,
    fontSize: 19,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.74)',
    flexShrink: 1,
  },
  rolePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.26)',
  },
  rolePillText: {
    color: '#FFFFFF',
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.3,
  },
});
