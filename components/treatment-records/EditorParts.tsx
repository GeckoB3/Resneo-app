import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { useTreatmentVersions } from '@/lib/queries/useTreatmentRecords';
import { CHANGED_FIELD_NAMES, PHOTO_LABELS, TR_COPY, UNITS } from '@/lib/treatment-records/copy';
import { emptyProduct } from '@/lib/treatment-records/draft';
import { formatDay, formatTime, formatYmd, isPastDay, ymdIn } from '@/lib/treatment-records/format';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { TreatmentEditorContext, TreatmentProductLine, TreatmentSuggestions } from '@/types/treatment-records';

/** Forms for this treatment (TR26): each required form's state, then photo consent, with Capture now. */
export function TreatmentFormsPanel({
  forms,
  timeZone,
  readOnly,
  onCapture,
}: {
  forms: NonNullable<TreatmentEditorContext['forms']>;
  timeZone: string | null | undefined;
  readOnly: boolean;
  onCapture: (typeId: string, name: string) => void;
}) {
  const { colors } = useTheme();
  const today = ymdIn(new Date(), timeZone);
  const stateText = (state: 'valid' | 'expired' | 'missing', completedAt: string | null) => {
    if (state === 'missing') return TR_COPY.formsMissing;
    if (state === 'expired') return TR_COPY.formsExpired(formatDay(completedAt, timeZone));
    return completedAt && ymdIn(completedAt, timeZone) === today ? TR_COPY.formsSignedToday : TR_COPY.formsSigned(formatDay(completedAt, timeZone));
  };
  const consent = forms.photo_consent;
  return (
    <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text variant="overline" tone="muted">
        {TR_COPY.formsHeading}
      </Text>
      {forms.requirements.map((r) => (
        <View key={r.compliance_type_id} style={styles.formRow}>
          <Text variant="bodySmall" style={styles.flex1}>
            {`${r.name}: `}
            <Text variant="bodySmall" color={r.state === 'valid' ? colors.success : colors.warning} style={styles.bold}>
              {stateText(r.state, r.completed_at)}
            </Text>
          </Text>
          {r.state !== 'valid' && !readOnly ? (
            <Button label={TR_COPY.captureNow} size="sm" variant="secondary" onPress={() => onCapture(r.compliance_type_id, r.name)} />
          ) : null}
        </View>
      ))}
      <View style={styles.formRow}>
        <Text variant="bodySmall" color={consent.state === 'valid' ? colors.success : colors.warning} style={[styles.flex1, styles.bold]}>
          {consent.state === 'valid' ? TR_COPY.photoConsentSigned(formatDay(consent.completed_at, timeZone)) : TR_COPY.photoConsentMissing}
        </Text>
        {consent.state !== 'valid' && consent.compliance_type_id && !readOnly ? (
          <Button
            label={TR_COPY.captureNow}
            size="sm"
            variant="secondary"
            onPress={() => onCapture(consent.compliance_type_id!, consent.name ?? 'Photo consent')}
          />
        ) : null}
      </View>
    </View>
  );
}

/** Up to four suggestions that start with what is typed, or contain it. */
function matching(options: string[], typed: string): string[] {
  const t = typed.trim().toLowerCase();
  if (!t) return [];
  const starts = options.filter((o) => o.toLowerCase().startsWith(t) && o.toLowerCase() !== t);
  const contains = options.filter((o) => !o.toLowerCase().startsWith(t) && o.toLowerCase().includes(t));
  return [...starts, ...contains].slice(0, 4);
}

/** "Products used" (TR13): name, batch, expiry, amount and unit, area, with suggestions (TR29). */
export function TreatmentProductsEditor({
  lines,
  readOnly,
  suggestions,
  timeZone,
  onChange,
}: {
  lines: TreatmentProductLine[];
  readOnly: boolean;
  suggestions: TreatmentSuggestions | undefined;
  timeZone: string | null | undefined;
  onChange: (lines: TreatmentProductLine[]) => void;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState<{ index: number; field: 'product' | 'batch' } | null>(null);
  // The amount as typed, so "1." survives until the next digit.
  const [amountText, setAmountText] = useState<Record<number, string>>({});
  const set = (i: number, patch: Partial<TreatmentProductLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const own = new Set(suggestions?.from_your_products ?? []);
  const productNames = [...new Set([...(suggestions?.product_names ?? []), ...(suggestions?.from_your_products ?? [])])];

  return (
    <View style={styles.section}>
      <Text variant="label">{TR_COPY.productsHeading}</Text>
      {lines.length === 0 ? (
        <Text variant="caption" tone="muted">
          No products.
        </Text>
      ) : null}
      {lines.map((line, i) => {
        const nameHints = focused?.index === i && focused.field === 'product' ? matching(productNames, line.product_name) : [];
        const batchOptions = (suggestions?.batches ?? []).filter(
          (b) => !line.product_name.trim() || b.product_name.toLowerCase() === line.product_name.trim().toLowerCase(),
        );
        const batchHints =
          focused?.index === i && focused.field === 'batch'
            ? batchOptions.filter((b) => !line.batch_number || b.batch_number.toLowerCase().startsWith(line.batch_number.toLowerCase())).slice(0, 4)
            : [];
        return (
          <View key={i} style={[styles.productCard, { borderColor: colors.border }]}>
            <Input
              label={TR_COPY.productFields.product}
              value={line.product_name}
              maxLength={120}
              editable={!readOnly}
              onFocus={() => setFocused({ index: i, field: 'product' })}
              onBlur={() => setFocused(null)}
              onChangeText={(v) => set(i, { product_name: v })}
            />
            {nameHints.length > 0 ? (
              <View style={styles.hints}>
                {nameHints.map((n) => (
                  <Chip key={n} label={own.has(n) ? `${n} (${TR_COPY.fromYourProducts})` : n} onPress={() => set(i, { product_name: n })} />
                ))}
              </View>
            ) : null}
            <Input
              label={TR_COPY.productFields.batch}
              value={line.batch_number ?? ''}
              maxLength={60}
              editable={!readOnly}
              autoCapitalize="characters"
              onFocus={() => setFocused({ index: i, field: 'batch' })}
              onBlur={() => setFocused(null)}
              onChangeText={(v) => set(i, { batch_number: v || null })}
            />
            {batchHints.length > 0 ? (
              <View style={styles.hints}>
                {batchHints.map((b) => (
                  <Chip
                    key={`${b.product_name}-${b.batch_number}`}
                    label={b.batch_number}
                    onPress={() => set(i, { batch_number: b.batch_number, ...(line.expiry_date ? {} : { expiry_date: b.expiry_date }) })}
                  />
                ))}
              </View>
            ) : null}
            <View style={styles.expiryRow}>
              <Text variant="label" style={styles.flex1}>
                {TR_COPY.productFields.expiry}
              </Text>
              {line.expiry_date ? (
                <>
                  <DatePickerField
                    value={line.expiry_date}
                    disabled={readOnly}
                    accessibilityLabel={`${TR_COPY.productFields.expiry}, ${formatYmd(line.expiry_date)}`}
                    onChange={(d) => set(i, { expiry_date: d })}
                  />
                  {!readOnly ? <Button label="Clear" size="sm" variant="ghost" onPress={() => set(i, { expiry_date: null })} /> : null}
                </>
              ) : !readOnly ? (
                <Button label="Add expiry date" size="sm" variant="ghost" onPress={() => set(i, { expiry_date: ymdIn(new Date(), timeZone) })} />
              ) : (
                <Text variant="bodySmall" tone="muted">
                  None
                </Text>
              )}
            </View>
            {line.expiry_date && isPastDay(line.expiry_date, timeZone) ? (
              <Text variant="caption" color={colors.warning} style={styles.bold}>
                {TR_COPY.expiryWarning}
              </Text>
            ) : null}
            <View style={styles.amountRow}>
              <View style={styles.amountField}>
                <Input
                  label={TR_COPY.productFields.amount}
                  value={amountText[i] ?? (line.amount != null ? String(line.amount) : '')}
                  keyboardType="decimal-pad"
                  editable={!readOnly}
                  onChangeText={(v) => {
                    const text = v.replace(',', '.');
                    setAmountText((m) => ({ ...m, [i]: text }));
                    const n = Number(text);
                    set(i, { amount: text.trim() === '' || Number.isNaN(n) ? null : n });
                  }}
                />
              </View>
            </View>
            <View style={styles.hints} accessibilityLabel={TR_COPY.productFields.unit}>
              {UNITS.map((u) => (
                <Chip key={u} label={u} selected={line.unit === u} onPress={readOnly ? undefined : () => set(i, { unit: line.unit === u ? null : u })} />
              ))}
            </View>
            <Input
              label={TR_COPY.productFields.area}
              value={line.area ?? ''}
              maxLength={120}
              editable={!readOnly}
              onChangeText={(v) => set(i, { area: v || null })}
            />
            {!readOnly ? (
              <Button
                label="Remove"
                size="sm"
                variant="ghost"
                customColors={{ background: 'transparent', text: colors.danger }}
                onPress={() => {
                  setAmountText({});
                  onChange(lines.filter((_, j) => j !== i));
                }}
              />
            ) : null}
          </View>
        );
      })}
      {!readOnly && lines.length < 30 ? (
        <Button label={TR_COPY.addProduct} size="sm" variant="secondary" onPress={() => onChange([...lines, emptyProduct()])} />
      ) : null}
    </View>
  );
}

/** See changes (TR8): each earlier version, newest first; tap one to read it in full. */
export function TreatmentRecordChanges({ recordId, timeZone, onBack }: { recordId: string; timeZone: string | null | undefined; onBack: () => void }) {
  const { colors } = useTheme();
  const versions = useTreatmentVersions(recordId);
  const [openId, setOpenId] = useState<string | null>(null);
  const fields = (f: string[]) => f.map((x) => CHANGED_FIELD_NAMES[x as keyof typeof CHANGED_FIELD_NAMES] ?? x).join(', ');
  const data = versions.data;
  const opened = data?.versions.find((v) => v.id === openId) ?? null;
  return (
    <View style={styles.section}>
      <View style={styles.formRow}>
        <Text variant="subheading" style={styles.flex1}>
          {TR_COPY.changesTitle}
        </Text>
        <Button label="Back" size="sm" variant="ghost" onPress={opened ? () => setOpenId(null) : onBack} />
      </View>
      {versions.isError ? (
        <Text variant="bodySmall" tone="danger">
          Could not load the changes.
        </Text>
      ) : !data ? (
        <Text variant="bodySmall" tone="muted">
          Loading…
        </Text>
      ) : opened ? (
        <View style={styles.section}>
          <Text variant="caption" tone="muted">
            {`${opened.edited_by_name ?? 'A team member'}${opened.edited_by_venue_name ? ` (${opened.edited_by_venue_name})` : ''}, ${formatDay(opened.edited_at, timeZone)} at ${formatTime(opened.edited_at, timeZone)}`}
          </Text>
          <Text variant="caption" tone="secondary">
            {[`${formatDay(opened.treated_at, timeZone)} at ${formatTime(opened.treated_at, timeZone)}`, opened.service_name, opened.practitioner_name].filter(Boolean).join(', ')}
          </Text>
          <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text variant="bodySmall">{opened.note || 'No notes.'}</Text>
          </View>
          {opened.products.map((p, i) => (
            <Text key={i} variant="bodySmall">
              {`• ${[p.product_name, p.batch_number ? `batch ${p.batch_number}` : null, p.expiry_date ? `expires ${formatYmd(p.expiry_date)}` : null, p.amount != null ? `${p.amount}${p.unit ? ` ${p.unit}` : ''}` : null, p.area].filter(Boolean).join(', ')}`}
            </Text>
          ))}
          {opened.photos.length > 0 ? (
            <View style={styles.photoGrid}>
              {opened.photos.map((p) => (
                <View key={p.id} style={styles.photoCell}>
                  {p.preview_url ? <Image source={{ uri: p.preview_url }} style={styles.photo} /> : <View style={[styles.photo, { backgroundColor: colors.surface }]} />}
                  <Text variant="caption" tone="muted">
                    {PHOTO_LABELS.find((l) => l.value === p.label)?.label ?? ''}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.section}>
          <View style={[styles.versionRow, { borderColor: colors.border }]}>
            <Text variant="bodyMedium">{TR_COPY.currentVersion}</Text>
            <Text variant="caption" tone="muted">
              {`${data.current.edited_by_name ?? 'A team member'}, ${formatDay(data.current.edited_at, timeZone)} at ${formatTime(data.current.edited_at, timeZone)}${
                data.current.changed_fields.length > 0 ? `. Changed: ${fields(data.current.changed_fields)}` : ''
              }`}
            </Text>
          </View>
          {data.versions.map((v) => {
            const who = `${v.edited_by_name ?? 'A team member'}${v.edited_by_venue_name ? ` (${v.edited_by_venue_name})` : ''}`;
            const line =
              v.changed_fields.length > 0
                ? TR_COPY.versionLine(who, formatDay(v.edited_at, timeZone), formatTime(v.edited_at, timeZone), fields(v.changed_fields))
                : TR_COPY.firstVersionLine(who, formatDay(v.edited_at, timeZone), formatTime(v.edited_at, timeZone));
            return (
              <Pressable
                key={v.id}
                accessibilityRole="button"
                onPress={() => setOpenId(v.id)}
                style={({ pressed }) => [styles.versionRow, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
                <Text variant="bodySmall">{line}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
  bold: {
    fontWeight: '600',
  },
  section: {
    gap: spacing.sm,
  },
  productCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  hints: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  amountRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  amountField: {
    width: 140,
  },
  versionRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: 2,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photoCell: {
    width: 96,
    gap: 2,
  },
  photo: {
    width: 96,
    height: 96,
    borderRadius: radius.sm,
  },
});
