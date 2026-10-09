import { Stack, useNavigation } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { SectionCard } from '@/components/ui/SectionCard';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError, apiErrorCode } from '@/lib/api/client';
import { posErrorMessage } from '@/lib/pos/api';
import { isLoyaltyEnabled, isShopEnabled, isVouchersEnabled } from '@/lib/pos/pos-enabled';
import { canOpenCheckoutSettings } from '@/lib/pos/checkout-settings-sections';
import { clientWords, settingsCopyFor, type ClientWords, type SettingsT } from '@/lib/pos/settings-copy';
import { currencySymbol, penceToText, textToPence, useSectionForm, type SectionForm } from '@/lib/pos/settings-form';
import { useCheckoutSettingsQuery, useSaveCheckoutSettings, type SaveResult } from '@/lib/queries/useCheckoutSettings';
import { usePosEnabled } from '@/lib/queries/usePos';
import { useVenue } from '@/lib/queries/useVenue';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosCheckoutSettings, PosSettingsKey, PosSettingsResponse } from '@/types/pos-settings';

/**
 * The pieces every Checkout settings screen shares (web: `fields.tsx` and
 * `CheckoutSettingsContext.tsx`): the shell that loads the settings and gates the screen, one
 * section card with its own Save, switches, money and text fields, radio lists, reason chips and
 * the unsaved-changes guard.
 */

export interface CheckoutSettingsCtx {
  data: PosSettingsResponse;
  t: SettingsT;
  words: ClientWords;
  currency: string;
  /** `manage_settings` (admins always). */
  canEdit: boolean;
  save: (partial: Partial<PosCheckoutSettings>) => Promise<SaveResult>;
  vouchersEnabled: boolean;
  loyaltyEnabled: boolean;
  shopEnabled: boolean;
  refetch: () => void;
}

const Ctx = createContext<CheckoutSettingsCtx | null>(null);

export function useCheckoutSettingsCtx(): CheckoutSettingsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCheckoutSettingsCtx must be used inside CheckoutSettingsShell');
  return ctx;
}

/** The venue's client words and the copy function, outside the shell too. */
export function useSettingsT(): { t: SettingsT; words: ClientWords } {
  const { terminology } = useVenueContext();
  return useMemo(() => {
    const words = clientWords(terminology.client);
    return { t: settingsCopyFor(words), words };
  }, [terminology.client]);
}

/**
 * Loads `GET /api/venue/pos/settings` and shows the screen only when Checkout is on and this login
 * may open Checkout settings (admins, and team members with `manage_settings`). `adminOnly` screens
 * (team permissions) need `can.edit_capabilities`.
 */
export function CheckoutSettingsShell({
  title,
  adminOnly = false,
  children,
}: {
  title: string;
  adminOnly?: boolean;
  children: ReactNode;
}) {
  const { t, words } = useSettingsT();
  const posEnabled = usePosEnabled();
  const venue = useVenue();
  const query = useCheckoutSettingsQuery();
  const save = useSaveCheckoutSettings();
  const header = <Stack.Screen options={{ headerShown: true, title }} />;

  const value = useMemo<CheckoutSettingsCtx | null>(() => {
    const data = query.data;
    if (!data) return null;
    return {
      data,
      t,
      words,
      currency: data.venue?.currency ?? 'GBP',
      canEdit: data.can.is_admin || data.can.manage_settings,
      save,
      vouchersEnabled: isVouchersEnabled(venue.data),
      loyaltyEnabled: isLoyaltyEnabled(venue.data),
      shopEnabled: isShopEnabled(venue.data),
      refetch: () => void query.refetch(),
    };
  }, [query, t, words, save, venue.data]);

  if (!posEnabled) {
    return (
      <Screen>
        {header}
        <EmptyState title={t('app.set.error.title')} message={t('err.unavailable')} />
      </Screen>
    );
  }
  if (query.isLoading) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }
  if (query.isError || !value) {
    const off = query.error instanceof ApiError && apiErrorCode(query.error) === 'feature_disabled';
    return (
      <Screen>
        {header}
        {off ? (
          <EmptyState title={t('app.set.error.title')} message={t('err.unavailable')} />
        ) : (
          <ErrorState
            title={t('app.set.error.title')}
            message={posErrorMessage(query.error, t('common.networkError'))}
            onRetry={() => void query.refetch()}
          />
        )}
      </Screen>
    );
  }
  if (!canOpenCheckoutSettings(value.data.can)) {
    return (
      <Screen>
        {header}
        <EmptyState title={t('app.set.noAccess.title')} message={t('app.set.noAccess.body')} />
      </Screen>
    );
  }
  if (adminOnly && !value.data.can.edit_capabilities) {
    return (
      <Screen>
        {header}
        <EmptyState title={t('app.set.adminOnly.title')} message={t('app.set.adminOnly.body')} />
      </Screen>
    );
  }
  return (
    <Screen
      scroll
      keyboardAvoiding
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}>
      {header}
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
    </Screen>
  );
}

/**
 * A section's draft over its own settings keys (`useSectionForm`), saved through the shell's
 * versioned save; a good save says `savedMessage` (the web's save strip message) in a toast.
 */
export function useSettingsSection<K extends PosSettingsKey>(keys: readonly K[], savedMessage: string): SectionForm<K> {
  const { data, save } = useCheckoutSettingsCtx();
  const toast = useToast();
  const saveAndSay = useCallback(
    async (partial: Partial<PosCheckoutSettings>) => {
      const r = await save(partial);
      if (r.ok) toast.success(savedMessage);
      return r;
    },
    [save, toast, savedMessage],
  );
  return useSectionForm(data.settings, keys, saveAndSay);
}

/** One section with its own Save, enabled only with changes (web `FormCard`). */
export function FormSection({
  title,
  description,
  children,
  dirty = false,
  saving = false,
  error,
  stale = false,
  canEdit = false,
  onSave,
  onDiscard,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  dirty?: boolean;
  saving?: boolean;
  error?: string | null;
  stale?: boolean;
  canEdit?: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
}) {
  const { t } = useSettingsT();
  return (
    <SectionCard>
      <SectionCard.Header title={title} description={description} />
      <SectionCard.Body style={styles.body}>
        {error ? <Banner tone={stale ? 'warning' : 'danger'}>{error}</Banner> : null}
        {children}
      </SectionCard.Body>
      {canEdit && onSave ? (
        <SectionCard.Footer style={styles.footer}>
          {dirty && onDiscard ? (
            <Button
              label={stale ? t('common.useTheirs') : t('common.discard')}
              variant="ghost"
              onPress={onDiscard}
              disabled={saving}
              fullWidth
            />
          ) : null}
          <Button label={t('common.save')} onPress={onSave} disabled={!dirty} loading={saving} fullWidth />
        </SectionCard.Footer>
      ) : null}
    </SectionCard>
  );
}

/** A tinted line: a refusal, a stale save, or a note. */
export function Banner({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: ReactNode }) {
  const { colors } = useTheme();
  const bg =
    tone === 'danger'
      ? colors.dangerSurface
      : tone === 'warning'
        ? colors.warningSurface
        : tone === 'success'
          ? colors.successSurface
          : colors.infoSurface;
  const border =
    tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : tone === 'success' ? colors.success : colors.info;
  return (
    <View
      style={[styles.banner, { backgroundColor: bg, borderColor: border }]}
      accessibilityRole={tone === 'danger' || tone === 'warning' ? 'alert' : undefined}>
      <Text variant="bodySmall">{children}</Text>
    </View>
  );
}

/** A small result line under a switch: green when done, red when refused. */
export function MessageLine({ message }: { message: { kind: 'ok' | 'error'; text: string } | null }) {
  if (!message) return null;
  return (
    <Text
      variant="caption"
      tone={message.kind === 'error' ? 'danger' : 'success'}
      accessibilityRole={message.kind === 'error' ? 'alert' : undefined}>
      {message.text}
    </Text>
  );
}

/** A labelled switch with optional help (web `Toggle`). */
export function SwitchRow({
  label,
  help,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  help?: string | null;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.flex}>
        <Text variant="bodyMedium">{label}</Text>
        {help ? (
          <Text variant="caption" tone="muted">
            {help}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled }}
      />
    </View>
  );
}

/** A label above and help under a control (web `FieldShell`). */
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

/** A text field holding null when empty (web `TextField`). */
export function TextField({
  label,
  help,
  error,
  value,
  onChange,
  disabled = false,
  maxLength,
  keyboardType,
  autoComplete,
  multiline = false,
  autoCapitalize,
}: {
  label: string;
  help?: string | null;
  error?: string | null;
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  maxLength?: number;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad' | 'decimal-pad';
  autoComplete?: 'email' | 'tel' | 'postal-code' | 'street-address' | 'off';
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <Input
      label={label}
      helper={help ?? undefined}
      error={error ?? undefined}
      value={value ?? ''}
      onChangeText={(text) => onChange(text === '' ? null : text)}
      editable={!disabled}
      maxLength={maxLength}
      keyboardType={keyboardType}
      autoComplete={autoComplete}
      autoCapitalize={autoCapitalize}
      multiline={multiline}
      style={multiline ? styles.multiline : undefined}
      accessibilityLabel={label}
    />
  );
}

/**
 * An amount typed in pounds (or the venue's currency), held as pence (web `MoneyInput`). Empty is
 * null; text that is not an amount is NaN, so the server's sentence explains it.
 */
export function MoneyField({
  label,
  help,
  error,
  value,
  onChange,
  currency,
  disabled = false,
}: {
  label: string;
  help?: string | null;
  error?: string | null;
  value: number | null;
  onChange: (pence: number | null) => void;
  currency: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => penceToText(value));
  const [prevValue, setPrevValue] = useState<number | null>(value);
  // Follow a value that changed from outside (a reload after someone else saved).
  if (value !== prevValue && !(Number.isNaN(value) && Number.isNaN(prevValue))) {
    setPrevValue(value);
    if (textToPence(text) !== value) setText(penceToText(value));
  }
  return (
    <Input
      label={label}
      helper={help ?? undefined}
      error={error ?? undefined}
      value={text}
      editable={!disabled}
      keyboardType="decimal-pad"
      accessibilityLabel={label}
      leftIcon={
        <Text variant="body" tone="muted">
          {currencySymbol(currency)}
        </Text>
      }
      onChangeText={(next) => {
        setText(next);
        const pence = next.trim() === '' ? null : (textToPence(next) ?? Number.NaN);
        setPrevValue(pence);
        onChange(pence);
      }}
    />
  );
}

/** A whole-number field with a trailing %, NaN when not a number. */
export function PercentField({
  label,
  help,
  error,
  value,
  onChange,
  disabled = false,
  decimal = false,
  text: controlledText,
}: {
  label: string;
  help?: string | null;
  error?: string | null;
  value?: number;
  onChange: (text: string) => void;
  disabled?: boolean;
  decimal?: boolean;
  /** Pass the raw text instead of a number (preset percentages keep "12.5"). */
  text?: string;
}) {
  const shown = controlledText ?? (value !== undefined && Number.isFinite(value) ? String(value) : '');
  return (
    <Input
      label={label}
      helper={help ?? undefined}
      error={error ?? undefined}
      value={shown}
      editable={!disabled}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      accessibilityLabel={label}
      rightSlot={
        <Text variant="body" tone="muted">
          %
        </Text>
      }
      onChangeText={onChange}
    />
  );
}

/** A single choice as a list of radio rows (web `RadioGroup`). */
export function RadioList<V extends string>({
  label,
  help,
  error,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  help?: string | null;
  error?: string | null;
  value: V | null;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.field} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text variant="label">{label}</Text>
      {help ? (
        <Text variant="caption" tone="muted">
          {help}
        </Text>
      ) : null}
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: selected, disabled }}
            style={({ pressed }) => [styles.radioRow, { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }]}>
            <View style={[styles.radio, { borderColor: selected ? colors.brand : colors.borderStrong }]}>
              {selected ? <View style={[styles.radioDot, { backgroundColor: colors.brand }]} /> : null}
            </View>
            <Text variant="bodySmall" style={styles.flex}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
      {error ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** Editable chips: short reasons with an add field and a remove button on each (web `ReasonChips`). */
export function ReasonChips({
  label,
  addLabel,
  values,
  onChange,
  disabled = false,
  error,
}: {
  label: string;
  addLabel: string;
  values: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const { t } = useSettingsT();
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const add = () => {
    const v = text.trim();
    if (!v) return;
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setLocalError(t('err.nameTaken', { name: v }));
      return;
    }
    onChange([...values, v.slice(0, 60)]);
    setText('');
    setLocalError(null);
  };
  return (
    <View style={styles.field}>
      <Text variant="label">{label}</Text>
      <View style={styles.chips}>
        {values.map((r) => (
          <View key={r} style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text variant="bodySmall" numberOfLines={1} style={styles.chipText}>
              {r}
            </Text>
            {!disabled ? (
              <Pressable
                onPress={() => onChange(values.filter((x) => x !== r))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('set.reasons.remove', { reason: r })}>
                <SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} tintColor={colors.textMuted} size={16} />
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
      {!disabled ? (
        <View style={styles.addRow}>
          <View style={styles.flex}>
            <Input
              value={text}
              placeholder={addLabel}
              accessibilityLabel={addLabel}
              maxLength={60}
              returnKeyType="done"
              onSubmitEditing={add}
              onChangeText={(next) => {
                setText(next);
                setLocalError(null);
              }}
            />
          </View>
          <Button
            label={t('set.reasons.addButton')}
            accessibilityLabel={addLabel}
            variant="secondary"
            size="sm"
            onPress={add}
            disabled={!text.trim()}
          />
        </View>
      ) : null}
      {localError || error ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {localError ?? error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Asks before leaving with unsaved changes (web `useUnsavedSettings`; the app's `common.unsaved`).
 * Returns the confirm sheet to render.
 */
export function useUnsavedGuard(dirty: boolean): ReactNode {
  const navigation = useNavigation();
  const { t } = useSettingsT();
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
      title={t('common.unsaved')}
      confirmLabel={t('common.leave')}
      cancelLabel={t('common.stay')}
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

export const settingsStyles = StyleSheet.create({
  stack: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  listRow: { paddingVertical: spacing.sm, gap: spacing.sm },
  divider: { height: StyleSheet.hairlineWidth },
  group: { gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
});

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.xl },
  body: { gap: spacing.lg },
  footer: { gap: spacing.sm },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  field: { gap: spacing.xs },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 40 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    maxWidth: '100%',
  },
  chipText: { flexShrink: 1 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
