import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Input,
  Screen,
  Segmented,
  Skeleton,
  StatusPill,
  Text,
} from '@/components/ui';
import {
  accent,
  brand,
  radius,
  spacing,
  typography,
  type TypographyVariant,
} from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Design-system gallery (dev-only). Visual QA for the Resneo theme + primitives.
 * Reach it from the sign-in screen's dev link, or router.push('/design-system').
 * Follows the device's light/dark setting — toggle it to verify both themes.
 */
export default function DesignSystemScreen() {
  const { colors, isDark } = useTheme();

  const [chips, setChips] = useState<Record<string, boolean>>({ All: true });
  const [range, setRange] = useState<'day' | 'week' | 'month'>('day');
  const [text, setText] = useState('');

  const typographyVariants = Object.keys(typography) as TypographyVariant[];

  return (
    <Screen scroll>
      <View style={styles.intro}>
        <Text variant="display">Design system</Text>
        <Text variant="body" tone="secondary">
          Resneo UI primitives · currently rendering the {isDark ? 'dark' : 'light'} theme. Switch
          your device appearance to preview the other.
        </Text>
      </View>

      {/* ---- Colour ramps ---- */}
      <Section title="Brand · ResNeo Night">
        <Ramp ramp={brand} />
      </Section>

      <Section title="Accent · Neo Teal">
        <Ramp ramp={accent} />
      </Section>

      <Section title="Semantic">
        <View style={styles.swatchRow}>
          <Swatch label="success" color={colors.success} />
          <Swatch label="warning" color={colors.warning} />
          <Swatch label="danger" color={colors.danger} />
          <Swatch label="border" color={colors.border} />
          <Swatch label="surface" color={colors.surface} />
          <Swatch label="text" color={colors.text} />
        </View>
      </Section>

      {/* ---- Typography ---- */}
      <Section title="Typography · Inter">
        {typographyVariants.map((variant) => (
          <Text key={variant} variant={variant} style={styles.typeRow}>
            {variant}
          </Text>
        ))}
      </Section>

      {/* ---- Buttons ---- */}
      <Section title="Buttons">
        <View style={styles.wrapRow}>
          <Button label="Primary" onPress={noop} />
          <Button label="Accent" variant="accent" onPress={noop} />
          <Button label="Secondary" variant="secondary" onPress={noop} />
          <Button label="Ghost" variant="ghost" onPress={noop} />
          <Button label="Danger" variant="danger" onPress={noop} />
        </View>
        <View style={styles.wrapRow}>
          <Button label="Small" size="sm" onPress={noop} />
          <Button label="Medium" size="md" onPress={noop} />
          <Button label="Large" size="lg" onPress={noop} />
        </View>
        <View style={styles.wrapRow}>
          <Button label="Loading" loading onPress={noop} />
          <Button label="Disabled" disabled onPress={noop} />
        </View>
        <Button label="Full width" fullWidth onPress={noop} />
      </Section>

      {/* ---- Inputs ---- */}
      <Section title="Inputs">
        <Input
          label="Guest name"
          placeholder="e.g. Jordan Smith"
          value={text}
          onChangeText={setText}
          helper="Tap to see the focus ring."
        />
        <View style={styles.gap} />
        <Input label="Email" placeholder="you@salon.com" error="Enter a valid email." />
      </Section>

      {/* ---- Cards ---- */}
      <Section title="Cards">
        <Card elevation="none">
          <Text variant="label">Flat (none)</Text>
          <Text variant="bodySmall" tone="secondary">
            Bordered surface, no shadow.
          </Text>
        </Card>
        <View style={styles.gap} />
        <Card>
          <Text variant="label">Card</Text>
          <Text variant="bodySmall" tone="secondary">
            Default elevation for grouped content.
          </Text>
        </Card>
        <View style={styles.gap} />
        <Card elevation="raised" onPress={noop}>
          <Text variant="label">Raised · pressable</Text>
          <Text variant="bodySmall" tone="secondary">
            Higher shadow; tap to see the press dim.
          </Text>
        </Card>
      </Section>

      {/* ---- Badges & statuses ---- */}
      <Section title="Badges">
        <View style={styles.wrapRow}>
          <Badge label="Neutral" />
          <Badge label="Brand" tone="brand" />
          <Badge label="Accent" tone="accent" />
          <Badge label="Success" tone="success" />
          <Badge label="Warning" tone="warning" />
          <Badge label="Danger" tone="danger" />
          <Badge label="Solid" tone="brand" solid />
        </View>
        <View style={styles.gap} />
        <View style={styles.wrapRow}>
          {['Pending', 'Booked', 'Confirmed', 'Seated', 'Completed', 'Cancelled', 'No-Show'].map(
            (status) => (
              <StatusPill key={status} status={status} />
            ),
          )}
        </View>
      </Section>

      {/* ---- Chips ---- */}
      <Section title="Filter chips">
        <View style={styles.wrapRow}>
          {['All', 'Pending', 'Confirmed', 'Cancelled'].map((label) => (
            <Chip
              key={label}
              label={label}
              count={label === 'All' ? 24 : undefined}
              selected={!!chips[label]}
              onPress={() => setChips((prev) => ({ ...prev, [label]: !prev[label] }))}
            />
          ))}
        </View>
      </Section>

      {/* ---- Segmented ---- */}
      <Section title="Segmented control">
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
        />
      </Section>

      {/* ---- Avatars ---- */}
      <Section title="Avatars">
        <View style={styles.wrapRow}>
          <Avatar name="Jordan Smith" size={48} />
          <Avatar name="Aoife Brennan" size={48} />
          <Avatar name="Liam O'Neill" size={48} />
          <Avatar name="Priya Patel" size={48} />
          <Avatar name="Sam" size={48} />
        </View>
      </Section>

      {/* ---- Skeletons ---- */}
      <Section title="Skeleton loaders">
        <View style={styles.skeletonRow}>
          <Skeleton width={48} height={48} radius={radius.full} />
          <View style={styles.skeletonLines}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="40%" height={12} />
          </View>
        </View>
      </Section>

      {/* ---- States ---- */}
      <Section title="Empty state">
        <View style={styles.stateBox}>
          <EmptyState
            title="No bookings yet"
            message="New bookings will appear here as they come in."
            actionLabel="New booking"
            onAction={noop}
          />
        </View>
      </Section>

      <View style={styles.footer} />
    </Screen>
  );
}

function noop() {}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="overline" tone="muted" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Ramp({ ramp }: { ramp: Record<number, string> }) {
  return (
    <View style={styles.rampRow}>
      {Object.entries(ramp).map(([step, color]) => (
        <View key={step} style={styles.rampItem}>
          <View style={[styles.rampSwatch, { backgroundColor: color }]} />
          <Text variant="caption" tone="muted">
            {step}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Swatch({ label, color }: { label: string; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.swatch}>
      <View style={[styles.swatchBox, { backgroundColor: color, borderColor: colors.border }]} />
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  rampRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rampItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  rampSwatch: {
    width: 28,
    height: 40,
    borderRadius: radius.sm,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.base,
  },
  swatch: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  swatchBox: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  typeRow: {
    marginBottom: spacing.xs,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  gap: {
    height: spacing.md,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
  },
  skeletonLines: {
    flex: 1,
    gap: spacing.sm,
  },
  stateBox: {
    height: 240,
  },
  footer: {
    height: spacing['3xl'],
  },
});
