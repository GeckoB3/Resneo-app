import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips, PosSheet } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

import { aiT } from './copy';
import {
  blankOption,
  DRAFT_MAX_OPTIONS,
  draftNotes,
  optionLabel,
  type DraftOptionState,
  type ProductAiUsage,
  type ProductDraftState,
} from './model';

/**
 * Checking one product the reader found (the web card's Edit, as a sheet on a phone): the name,
 * brand and category, how it is used, and each size or shade with its price, cost and barcode. What
 * still needs a fix or a check shows above the form as it is typed, recomputed by the same rules as
 * the web and the server. Choosing how it is used clears the reader's guess; setting a price makes
 * it the owner's, not a possible trade price. Nothing is sent until the product is added.
 */
function DraftEditorBody({
  draft,
  onSave,
  onClose,
}: {
  draft: ProductDraftState;
  onSave: (draft: ProductDraftState) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [form, setForm] = useState<ProductDraftState>(() => ({ ...draft, options: draft.options.map((o) => ({ ...o })), error: null }));
  const notes = draftNotes(form).filter((n) => n.level !== 'info');
  const many = form.options.length > 1;

  const set = (patch: Partial<ProductDraftState>) => setForm((f) => ({ ...f, ...patch }));
  const setOption = (key: string, patch: Partial<DraftOptionState>) =>
    setForm((f) => ({
      ...f,
      options: f.options.map((o) => (o.key === key ? { ...o, ...patch } : o)),
      // Once the owner sets a price themselves, it is theirs, not a guess.
      ...(patch.price !== undefined ? { priceMaybeTrade: false } : {}),
    }));

  return (
    <PosSheet
      visible
      onClose={onClose}
      title={form.name.trim() || aiT('ai.card.unnamed')}
      footer={<Button label={aiT('ai.card.doneEditing')} onPress={() => onSave(form)} fullWidth />}>
      {notes.map((note, i) => (
        <View
          key={`${note.kind}-${i}`}
          style={[
            styles.note,
            note.level === 'fix'
              ? { backgroundColor: colors.dangerSurface, borderColor: colors.danger }
              : { backgroundColor: colors.warningSurface, borderColor: colors.warning },
          ]}>
          <Text variant="caption">{note.text}</Text>
        </View>
      ))}
      <Input
        label={aiT('ai.edit.name')}
        accessibilityLabel={aiT('ai.edit.name')}
        value={form.name}
        onChangeText={(name) => set({ name })}
        maxLength={120}
      />
      <Input
        label={aiT('ai.edit.brand')}
        accessibilityLabel={aiT('ai.edit.brand')}
        optional
        value={form.brand}
        onChangeText={(brand) => set({ brand })}
        maxLength={80}
      />
      <Input
        label={aiT('ai.edit.category')}
        accessibilityLabel={aiT('ai.edit.category')}
        optional
        value={form.category}
        onChangeText={(category) => set({ category })}
        maxLength={80}
      />
      <Text variant="label">{aiT('ai.edit.use')}</Text>
      <ChoiceChips<ProductAiUsage>
        options={[
          { value: 'retail', label: aiT('app.ai.use.retail') },
          { value: 'backbar', label: aiT('app.ai.use.backbar') },
          { value: 'both', label: aiT('app.ai.use.both') },
        ]}
        value={form.usage}
        onChange={(usage) => set({ usage, usageGuessed: false })}
      />
      <Text variant="label">{aiT('ai.edit.options')}</Text>
      {form.options.map((o, i) => {
        const field = (name: string) => aiT('ai.edit.optionField', { option: optionLabel('', i), field: name });
        return (
          <View key={o.key} style={[styles.option, { borderColor: colors.border }]}>
            <Input
              label={many ? optionLabel('', i) : aiT('ai.edit.option')}
              accessibilityLabel={field(aiT('ai.edit.option'))}
              optional={!many}
              placeholder={aiT('ai.edit.optionPlaceholder')}
              value={o.name}
              onChangeText={(name) => setOption(o.key, { name })}
              maxLength={80}
            />
            <View style={styles.pair}>
              <Input
                label={aiT('ai.edit.price')}
                accessibilityLabel={field(aiT('ai.edit.price'))}
                value={o.price}
                onChangeText={(price) => setOption(o.key, { price })}
                keyboardType="decimal-pad"
                inputMode="decimal"
                containerStyle={styles.flex}
              />
              <Input
                label={aiT('ai.edit.cost')}
                accessibilityLabel={field(aiT('ai.edit.cost'))}
                optional
                value={o.cost}
                onChangeText={(cost) => setOption(o.key, { cost })}
                keyboardType="decimal-pad"
                inputMode="decimal"
                containerStyle={styles.flex}
              />
            </View>
            <Input
              label={aiT('ai.edit.barcode')}
              accessibilityLabel={field(aiT('ai.edit.barcode'))}
              optional
              value={o.barcode}
              onChangeText={(barcode) => setOption(o.key, { barcode: barcode.trim() })}
              keyboardType="number-pad"
              maxLength={64}
            />
            {many ? (
              <Button
                label={aiT('ai.edit.removeOption', { option: optionLabel(o.name, i) })}
                size="sm"
                variant="ghost"
                onPress={() => setForm((f) => ({ ...f, options: f.options.filter((x) => x.key !== o.key) }))}
              />
            ) : null}
          </View>
        );
      })}
      <Text variant="caption" tone="muted">
        {aiT('ai.edit.costHelp')}
      </Text>
      {form.options.length < DRAFT_MAX_OPTIONS ? (
        <Button
          label={aiT('ai.edit.addOption')}
          variant="secondary"
          onPress={() => setForm((f) => ({ ...f, options: [...f.options, blankOption(f.key)] }))}
          fullWidth
        />
      ) : null}
    </PosSheet>
  );
}

/** Mounted per draft, so each opening starts with that draft's own values. */
export function DraftEditorSheet({ draft, ...rest }: Omit<Parameters<typeof DraftEditorBody>[0], 'draft'> & { draft: ProductDraftState | null }) {
  return draft ? <DraftEditorBody key={draft.key} draft={draft} {...rest} /> : null;
}

const styles = StyleSheet.create({
  note: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  option: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  pair: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
