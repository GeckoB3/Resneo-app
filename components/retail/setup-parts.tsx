import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ChoiceChips, posStyles } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Text } from '@/components/ui/Text';
import { useStockT } from '@/lib/retail/stock-setup-copy';
import { useShareDownload } from '@/lib/queries/useStockSetup';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

/**
 * Small pieces the products and stock set-up screens share: a tab row that scrolls sideways, a
 * labelled switch, a single-choice list of named things with "All" or "None", a date filter that
 * can be cleared, and a button that downloads a CSV or PDF to the share sheet.
 */

export function TabChips<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
      {tabs.map((tab) => (
        <Chip key={tab.value} label={tab.label} selected={tab.value === value} onPress={() => onChange(tab.value)} />
      ))}
    </ScrollView>
  );
}

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
    <View style={posStyles.row}>
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

/** One of a list of brands, categories or suppliers, or the first choice ("All", "No category"). */
export function NamedChoice({
  label,
  first,
  items,
  value,
  onChange,
}: {
  label: string;
  first: string;
  items: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <View style={styles.group}>
      <Text variant="label">{label}</Text>
      <ChoiceChips options={[{ value: '', label: first }, ...items.map((i) => ({ value: i.id, label: i.name }))]} value={value} onChange={onChange} />
    </View>
  );
}

/** A date filter: "Any date" until one is chosen, then the native picker and Clear. */
export function DateFilter({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  required,
}: {
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  /** A period's end that is always set: no Clear. */
  required?: boolean;
}) {
  const t = useStockT();
  return (
    <View style={styles.group}>
      <Text variant="bodySmall" tone="muted">
        {label}
      </Text>
      {value ? (
        <View style={posStyles.row}>
          <DatePickerField
            value={value}
            onChange={(v) => onChange(v)}
            accessibilityLabel={label}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
          />
          {required ? null : <Button label={t('ss.clearDate')} size="sm" variant="ghost" onPress={() => onChange(null)} />}
        </View>
      ) : (
        <Button
          label={t('ss.setDate')}
          size="sm"
          variant="ghost"
          accessibilityLabel={`${label}: ${t('ss.anyDate')}`}
          onPress={() => onChange(todayIso(maximumDate))}
        />
      )}
    </View>
  );
}

/** Today as YYYY-MM-DD on this phone, or the latest date allowed. */
export function todayIso(max?: Date): string {
  const d = max && max.getTime() < Date.now() ? max : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "Export CSV" and the like: downloads with the Bearer token and opens the share sheet. */
export function ShareFileButton({
  label,
  path,
  filename,
  mimeType = 'text/csv',
  variant = 'secondary',
}: {
  label: string;
  path: string;
  filename: string;
  mimeType?: string;
  variant?: 'secondary' | 'ghost';
}) {
  const t = useStockT();
  const toast = useToast();
  const share = useShareDownload();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      label={label}
      size="sm"
      variant={variant}
      loading={busy}
      onPress={async () => {
        setBusy(true);
        try {
          if (!(await share(path, filename, mimeType, label))) toast.error(t('ss.fileFailed'));
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  tabs: { gap: spacing.sm, paddingVertical: spacing.xxs },
  flex: { flex: 1 },
  group: { gap: spacing.xs },
});
