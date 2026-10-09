import { Stack, useNavigation } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { parseMoneyInput, penceToInput } from '@/lib/pos/sale-math';
import { isFeatureOff, settingsErrorMessage } from '@/lib/pos/settings-more/api';
import { smT } from '@/lib/pos/settings-more/copy';
import { usePosSettings } from '@/lib/pos/settings-more/hooks';
import type { PosSettingsResponse } from '@/lib/pos/settings-more/types';
import { usePosEnabled } from '@/lib/queries/usePos';
import { useVenue } from '@/lib/queries/useVenue';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * The pieces every screen in the second half of Checkout settings shares: the screen with its
 * gates (Checkout on, the feature's own switch, who may see it), a card per section, a switch row,
 * a labelled field, a money field, a single-choice list, the save bar with the web's stale and
 * error boxes, and the unsaved-changes guard.
 */

export type GateAnswer = 'ok' | 'admin_only' | { featureOff: string };

/**
 * A settings screen: the header, then the gates in the web's order. Checkout off (or the settings
 * route refusing with `feature_disabled`) shows `gate.posOff`; a feature switched off shows
 * `gate.featureOff`; a login the web would not show the card to sees `gate.adminOnly`. Only then
 * does `children` render, with the loaded settings.
 */
export function SettingsScreen({
  title,
  gate,
  children,
}: {
  title: string;
  /** Who sees the screen, from the loaded settings (web `CheckoutSettingsSection`). */
  gate?: (data: PosSettingsResponse) => GateAnswer;
  children: (data: PosSettingsResponse) => ReactNode;
}) {
  const venue = useVenue();
  const posEnabled = usePosEnabled();
  const query = usePosSettings({ enabled: posEnabled });
  const header = <Stack.Screen options={{ headerShown: true, title }} />;

  // The venue's switches are read from its bootstrap: wait for it rather than saying "off" early.
  if (!venue.data && venue.isLoading) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  if (!posEnabled || (query.isError && isFeatureOff(query.error))) {
    return (
      <Screen>
        {header}
        <EmptyState title={smT('gate.posOff.title')} message={smT('gate.posOff.body')} />
      </Screen>
    );
  }
  if (query.isLoading || (!query.data && !query.isError)) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }
  if (query.isError || !query.data) {
    return (
      <Screen>
        {header}
        <ErrorState message={settingsErrorMessage(query.error, smT('common.loadError'))} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }
  const answer = gate ? gate(query.data) : 'ok';
  if (answer !== 'ok') {
    const featureOff = typeof answer === 'object' ? answer.featureOff : null;
    return (
      <Screen>
        {header}
        {featureOff ? (
          <EmptyState
            title={smT('gate.featureOff.title', { feature: featureOff })}
            message={smT('gate.featureOff.body', { feature: featureOff })}
          />
        ) : (
          <EmptyState title={smT('gate.adminOnly.title')} message={smT('gate.adminOnly.body')} />
        )}
      </Screen>
    );
  }
  return (
    <Screen scroll={false} padded={false} keyboardAvoiding>
      {header}
      {children(query.data)}
    </Screen>
  );
}

/** The screen's scrolling body, with pull to refresh. */
export function SettingsScroll({
  children,
  refreshing = false,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}>
      {children}
    </ScrollView>
  );
}

/** One section of a settings screen (the web's `FormCard` without its footer). */
export function SettingsCard({
  title,
  description,
  children,
}: {
  title?: string | null;
  description?: string | null;
  children: ReactNode;
}) {
  return (
    <Card>
      <View style={styles.stack}>
        {title || description ? (
          <View style={styles.cardHeader}>
            {title ? (
              <Text variant="subheading" accessibilityRole="header">
                {title}
              </Text>
            ) : null}
            {description ? (
              <Text variant="bodySmall" tone="secondary">
                {description}
              </Text>
            ) : null}
          </View>
        ) : null}
        {children}
      </View>
    </Card>
  );
}

/** A tinted message box: `info` (blue note), `warning` (amber), `success` (green), `danger` (red). */
export function MessageBox({
  tone = 'info',
  children,
  role,
}: {
  tone?: 'info' | 'warning' | 'success' | 'danger';
  children: ReactNode;
  role?: 'alert' | 'status' | 'note';
}) {
  const { colors } = useTheme();
  const bg =
    tone === 'warning' ? colors.warningSurface : tone === 'success' ? colors.successSurface : tone === 'danger' ? colors.dangerSurface : colors.infoSurface;
  const border = tone === 'warning' ? colors.warning : tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : colors.info;
  return (
    <View
      style={[styles.box, { backgroundColor: bg, borderColor: border }]}
      accessibilityRole={role === 'alert' ? 'alert' : role === 'status' ? 'summary' : undefined}
      accessibilityLiveRegion={role === 'alert' || role === 'status' ? 'polite' : undefined}>
      <Text variant="bodySmall">{children}</Text>
    </View>
  );
}

/** A switch with its label and help (web `Toggle`). */
export function SwitchRow({
  label,
  help,
  value,
  onChange,
  disabled,
}: {
  label: string;
  help?: string | null;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.switchRow, disabled ? styles.dim : null]}>
      <View style={styles.flex}>
        <Text variant="bodyMedium">{label}</Text>
        {help ? (
          <Text variant="caption" tone="muted">
            {help}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} accessibilityLabel={label} />
    </View>
  );
}

/** A label, its help, the control and its error (web `FieldShell`). */
export function FieldBlock({
  label,
  help,
  error,
  children,
}: {
  label: string;
  help?: string | null;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text variant="label">{label}</Text>
      {help ? (
        <Text variant="caption" tone="muted">
          {help}
        </Text>
      ) : null}
      {children}
      {error ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A money field (web `MoneyInput`): the typed text is kept while typing and read as pence, null
 * when empty or not an amount. A new `value` from outside (a reload, a discard) replaces the text.
 */
export function MoneyField({
  value,
  onChange,
  accessibilityLabel,
  placeholder,
  editable = true,
}: {
  value: number | null;
  onChange: (pence: number | null) => void;
  accessibilityLabel: string;
  placeholder?: string;
  editable?: boolean;
}) {
  const shown = value != null && Number.isFinite(value) ? penceToInput(value) : '';
  const [text, setText] = useState(shown);
  const [seen, setSeen] = useState<number | null>(value);
  if (value !== seen) {
    setSeen(value);
    if (parseMoneyInput(text) !== value) setText(shown);
  }
  return (
    <Input
      value={text}
      onChangeText={(next) => {
        setText(next);
        const pence = parseMoneyInput(next);
        setSeen(pence);
        onChange(pence);
      }}
      keyboardType="decimal-pad"
      accessibilityLabel={accessibilityLabel}
      placeholder={placeholder ?? '0.00'}
      editable={editable}
    />
  );
}

/** A whole-number field; null while empty or not a number. */
export function WholeNumberField({
  value,
  onChange,
  accessibilityLabel,
  editable = true,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  accessibilityLabel: string;
  editable?: boolean;
}) {
  const shown = value != null && Number.isFinite(value) ? String(value) : '';
  const [text, setText] = useState(shown);
  const [seen, setSeen] = useState<number | null>(value);
  if (value !== seen) {
    setSeen(value);
    setText(shown);
  }
  return (
    <Input
      value={text}
      onChangeText={(next) => {
        setText(next);
        const n = /^\d+$/.test(next.trim()) ? Number(next.trim()) : null;
        setSeen(n);
        onChange(n);
      }}
      keyboardType="number-pad"
      accessibilityLabel={accessibilityLabel}
      editable={editable}
    />
  );
}

/** A single-choice list of full-width rows (web `RadioGroup`). */
export function OptionList<V extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label?: string | null;
  value: V | null;
  options: { value: V; label: string; help?: string | null }[];
  onChange: (value: V) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.field} accessibilityRole="radiogroup" accessibilityLabel={label ?? undefined}>
      {label ? <Text variant="label">{label}</Text> : null}
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected, disabled: Boolean(disabled) }}
            accessibilityLabel={o.label}
            style={({ pressed }) => [
              styles.option,
              {
                borderColor: selected ? colors.brand : colors.border,
                backgroundColor: selected ? colors.brandSubtle : colors.surfaceRaised,
                opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
              },
            ]}>
            <View style={[styles.radio, { borderColor: selected ? colors.brand : colors.borderStrong }]}>
              {selected ? <View style={[styles.radioDot, { backgroundColor: colors.brand }]} /> : null}
            </View>
            <View style={styles.flex}>
              <Text variant="bodyMedium">{o.label}</Text>
              {o.help ? (
                <Text variant="caption" tone="muted">
                  {o.help}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A tick box row (web checkbox lists). */
export function CheckRow({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.checkRow, { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }]}>
      <View style={[styles.checkBox, { borderColor: checked ? colors.brand : colors.borderStrong, backgroundColor: checked ? colors.brand : 'transparent' }]}>
        {checked ? (
          <Text variant="caption" color={colors.onBrand}>
            ✓
          </Text>
        ) : null}
      </View>
      <Text variant="body" style={styles.flex}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The save bar (web `FormCard` footer): the stale box in amber or the refusal in red, then
 * "Discard changes" (or "Use their changes" after a stale save) and "Save changes", enabled only
 * with changes.
 */
export function SaveBar({
  dirty,
  saving,
  error,
  stale,
  onSave,
  onDiscard,
  saveLabel,
}: {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  stale: boolean;
  onSave: () => void;
  onDiscard?: () => void;
  saveLabel?: string;
}) {
  return (
    <View style={styles.stack}>
      {error ? (
        <MessageBox tone={stale ? 'warning' : 'danger'} role="alert">
          {error}
        </MessageBox>
      ) : null}
      <Button label={saveLabel ?? smT('common.save')} onPress={onSave} disabled={!dirty} loading={saving} fullWidth />
      {dirty && onDiscard ? (
        <Button
          label={stale ? smT('common.useTheirs') : smT('common.discard')}
          variant="ghost"
          onPress={onDiscard}
          disabled={saving}
          fullWidth
        />
      ) : null}
    </View>
  );
}

/**
 * Asks before leaving with unsaved changes (the app's `common.unsaved` guard). Render the returned
 * element anywhere in the screen.
 */
export function useLeaveGuard(dirty: boolean): ReactNode {
  const navigation = useNavigation();
  const [leaving, setLeaving] = useState<Parameters<typeof navigation.dispatch>[0] | null>(null);
  const leavingOk = useRef(false);
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!dirty || leavingOk.current) return;
      e.preventDefault();
      setLeaving(e.data.action);
    });
    return unsubscribe;
  }, [navigation, dirty]);
  return (
    <ConfirmSheet
      visible={leaving !== null}
      title={smT('common.unsaved')}
      confirmLabel={smT('common.leave')}
      cancelLabel={smT('common.stay')}
      onConfirm={() => {
        const action = leaving;
        setLeaving(null);
        leavingOk.current = true;
        if (action) navigation.dispatch(action);
      }}
      onClose={() => setLeaving(null)}
    />
  );
}

/** A day as "9 October 2026" (web `dayText`), from "YYYY-MM-DD" or an ISO time. */
export function longDay(value: string | null | undefined): string {
  if (!value) return '';
  const at = /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T12:00:00Z`) : Date.parse(value);
  if (Number.isNaN(at)) return value;
  try {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(at));
  } catch {
    return value;
  }
}

export const settingsStyles = StyleSheet.create({
  stack: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
});

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.base, paddingBottom: spacing['3xl'] },
  stack: { gap: spacing.md },
  cardHeader: { gap: spacing.xs },
  flex: { flex: 1, minWidth: 0 },
  dim: { opacity: 0.6 },
  box: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  field: { gap: spacing.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
