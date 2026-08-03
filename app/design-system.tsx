import { Redirect } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  Dot,
  EmptyState,
  IconButton,
  Input,
  Screen,
  SearchBar,
  Segmented,
  Skeleton,
  StatusPill,
  Text,
} from '@/components/ui';
import { BookingLocationCallout } from '@/components/bookings/BookingLocationCallout';
import {
  BookingIntervalEditor,
  type BookingStartValue,
} from '@/components/manage/BookingIntervalEditor';
import { resolveStaffBookingLocation } from '@/lib/booking/staff-booking-location';
import { useToast } from '@/providers/ToastProvider';
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
 * Design-system gallery (DEV-ONLY). Visual QA for the Resneo theme + primitives.
 * Reach it via router.push('/design-system') in a dev build. Follows the
 * device's light/dark setting — toggle it to verify both themes.
 *
 * expo-router registers every file under app/ as a route regardless of __DEV__,
 * so the default export gates on __DEV__ and redirects in release builds — the
 * gallery body never mounts (and the route / deep link resolves to Home) in
 * production. Gating the body, not just the <Stack.Screen> options, is what
 * keeps the gallery out of the shipped app.
 */
export default function DesignSystemScreen() {
  if (!__DEV__) return <Redirect href="/" />;
  return <DesignSystemGallery />;
}

function DesignSystemGallery() {
  const { colors, isDark } = useTheme();

  const [chips, setChips] = useState<Record<string, boolean>>({ All: true });
  const [range, setRange] = useState<'day' | 'week' | 'month'>('day');
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [compliance, setCompliance] = useState(false);
  const toast = useToast();

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

      {/* ---- New primitives (this pass) ---- */}
      <Section title="Search bar">
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search appointments"
          right={
            <>
              <IconButton
                icon={{ ios: 'arrow.up.arrow.down', android: 'swap_vert', web: 'swap_vert' }}
                onPress={noop}
                accessibilityLabel="Sort"
                variant="bordered"
              />
              <IconButton
                icon={{ ios: 'line.3.horizontal.decrease', android: 'filter_list', web: 'filter_list' }}
                onPress={noop}
                accessibilityLabel="Filter"
                variant="bordered"
                active
              />
            </>
          }
        />
      </Section>

      <Section title="Icon buttons">
        <View style={styles.wrapRow}>
          <IconButton icon={{ ios: 'plus', android: 'add', web: 'add' }} onPress={noop} accessibilityLabel="Add" variant="plain" />
          <IconButton icon={{ ios: 'bell', android: 'notifications', web: 'notifications' }} onPress={noop} accessibilityLabel="Alerts" variant="tinted" />
          <IconButton icon={{ ios: 'slider.horizontal.3', android: 'tune', web: 'tune' }} onPress={noop} accessibilityLabel="Adjust" variant="bordered" />
          <IconButton icon={{ ios: 'checkmark', android: 'check', web: 'check' }} onPress={noop} accessibilityLabel="Done" variant="bordered" active />
        </View>
      </Section>

      <Section title="Status dots">
        <View style={styles.wrapRow}>
          <Dot color={colors.success} />
          <Dot color={colors.warning} size={10} />
          <Dot color={colors.danger} size={12} />
          <Dot color={colors.brand} size={8} />
        </View>
      </Section>

      <Section title="Removable & tinted chips">
        <View style={styles.wrapRow}>
          <Chip
            label="Needs compliance"
            count={3}
            selected={compliance}
            selectedColor="#E11D48"
            onPress={() => setCompliance((v) => !v)}
            onRemove={compliance ? () => setCompliance(false) : undefined}
          />
        </View>
      </Section>

      <Section title="Toasts (replaces Alert.alert — works on web)">
        <View style={styles.wrapRow}>
          <Button label="Success" size="sm" variant="secondary" onPress={() => toast.success('Booking confirmed')} />
          <Button label="Error" size="sm" variant="secondary" onPress={() => toast.error('That time isn’t available')} />
          <Button label="Info" size="sm" variant="secondary" onPress={() => toast.info('Synced just now')} />
          <Button
            label="Undo"
            size="sm"
            variant="secondary"
            onPress={() => toast.show({ message: 'Appointment moved to 14:30', actionLabel: 'Undo', onAction: noop })}
          />
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

      <Section title="Booking location callout">
        <View style={styles.calloutStack}>
          <BookingLocationCallout
            view={resolveStaffBookingLocation({
              location_type: 'client_address',
              client_address_line1: '12 Elm Row',
              client_address_city: 'Edinburgh',
              client_address_postcode: 'EH7 4AA',
            })}
          />
          <BookingLocationCallout
            view={resolveStaffBookingLocation({ location_type: 'client_address' })}
          />
          <BookingLocationCallout
            view={resolveStaffBookingLocation({
              location_type: 'online',
              online_meeting_url: 'https://meet.example.com/aura-hair-studio',
              online_meeting_info: 'Join a few minutes early so we can check your camera.',
            })}
          />
          <BookingLocationCallout
            view={resolveStaffBookingLocation({ location_type: 'online' })}
          />
        </View>
      </Section>

      <Section title="Booking start (interval vs fixed times)">
        <BookingStartDemo />
      </Section>

      <View style={styles.footer} />
    </Screen>
  );
}

/** Live demo of the two booking-start modes, driven by real editor state. */
function BookingStartDemo() {
  const [value, setValue] = useState<BookingStartValue>({
    intervalMinutes: 15,
    minuteMarks: null,
    startTimes: null,
  });
  return (
    <BookingIntervalEditor
      intervalMinutes={value.intervalMinutes}
      minuteMarks={value.minuteMarks}
      startTimes={value.startTimes}
      spanMinutes={30}
      onChange={setValue}
    />
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
  calloutStack: {
    gap: spacing.sm,
  },
  footer: {
    height: spacing['3xl'],
  },
});
