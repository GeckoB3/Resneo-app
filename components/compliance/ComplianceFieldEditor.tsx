import { type Dispatch } from 'react';
import { Platform, StyleSheet, Switch, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Dot } from '@/components/ui/Dot';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import {
  COMPLIANCE_FIELD_TYPES,
  type ComplianceField,
  type ComplianceFieldType,
  type ComplianceResultMapping,
} from '@/lib/compliance/form-schema';
import {
  type FieldBuilderAction,
  type FieldBuilderState,
} from '@/lib/compliance/field-builder';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

import { FIELD_TYPE_LABELS } from './complianceTypeLabels';

type Props = {
  state: FieldBuilderState;
  dispatch: Dispatch<FieldBuilderAction>;
  /** True for a `pass_fail` type — shows the ResultMappingEditor. */
  isPassFail: boolean;
};

/**
 * The mobile compliance form-field builder body. A vertical list of field cards
 * with add (palette chips) / edit (label, Required, Staff only, options) /
 * reorder (up-down) / delete, plus a description + intro-markdown editor and the
 * pass/fail ResultMappingEditor. Mirrors the web `ComplianceFormBuilder` field
 * list; reorder is up/down buttons rather than dnd-kit (native-friendly, no new
 * dep). Driven by the pure `fieldBuilderReducer` so it's fully unit-testable.
 */
export function ComplianceFieldEditor({ state, dispatch, isPassFail }: Props) {
  const { colors } = useTheme();
  const selectFields = state.fields.filter(
    (f): f is Extract<ComplianceField, { type: 'select' }> => f.type === 'select',
  );

  return (
    <View style={styles.root}>
      {/* Field palette */}
      <View style={styles.block}>
        <Text variant="label" tone="secondary">
          Add a field
        </Text>
        <View style={styles.chipWrap}>
          {COMPLIANCE_FIELD_TYPES.map((t) => (
            <Chip
              key={t}
              label={`+ ${FIELD_TYPE_LABELS[t] ?? t}`}
              onPress={() => dispatch({ type: 'addField', fieldType: t as ComplianceFieldType })}
            />
          ))}
        </View>
      </View>

      {/* Field list */}
      <View style={styles.block}>
        <Text variant="label" tone="secondary">
          Form fields
        </Text>
        {state.fields.length === 0 ? (
          <Text variant="caption" tone="muted">
            No fields yet. Add one from the palette above.
          </Text>
        ) : (
          <View style={styles.list}>
            {state.fields.map((field, index) => (
              <FieldCard
                key={field.id}
                field={field}
                index={index}
                count={state.fields.length}
                dispatch={dispatch}
              />
            ))}
          </View>
        )}

        {isPassFail ? (
          <ResultMappingEditor
            selectFields={selectFields}
            mapping={state.resultMapping}
            onChange={(mapping) => dispatch({ type: 'setResultMapping', mapping })}
          />
        ) : null}
      </View>

      {/* Description + intro markdown */}
      <Input
        label="Description (optional)"
        value={state.description}
        onChangeText={(v) => dispatch({ type: 'setDescription', value: v })}
        placeholder="Shown at the top of the form"
        autoCapitalize="sentences"
      />
      <View style={styles.block}>
        <Text variant="label" tone="secondary">
          Intro text (optional)
        </Text>
        <TextInput
          accessibilityLabel="Intro text"
          value={state.introMarkdown}
          onChangeText={(v) => dispatch({ type: 'setIntroMarkdown', value: v })}
          placeholder="Guidance for the person completing the form (markdown supported)"
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={3}
          style={[
            styles.markdownInput,
            { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          textAlignVertical="top"
        />
      </View>
    </View>
  );
}

function FieldCard({
  field,
  index,
  count,
  dispatch,
}: {
  field: ComplianceField;
  index: number;
  count: number;
  dispatch: Dispatch<FieldBuilderAction>;
}) {
  const { colors } = useTheme();
  const hasOptions = field.type === 'select' || field.type === 'multiselect';

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardTop}>
        <View style={[styles.typeTag, { backgroundColor: colors.surfaceRaised }]}>
          <Text variant="caption" tone="muted">
            {FIELD_TYPE_LABELS[field.type] ?? field.type}
          </Text>
        </View>
        <View style={styles.cardTopActions}>
          <IconButton
            icon={{ ios: 'chevron.up', android: 'keyboard_arrow_up', web: 'keyboard_arrow_up' }}
            accessibilityLabel={`Move ${field.label} up`}
            size={36}
            iconSize={18}
            disabled={index === 0}
            onPress={() => dispatch({ type: 'moveField', id: field.id, direction: 'up' })}
          />
          <IconButton
            icon={{ ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' }}
            accessibilityLabel={`Move ${field.label} down`}
            size={36}
            iconSize={18}
            disabled={index === count - 1}
            onPress={() => dispatch({ type: 'moveField', id: field.id, direction: 'down' })}
          />
          <Button
            label="Remove"
            variant="ghost"
            size="sm"
            customColors={{ background: 'transparent', text: colors.danger }}
            onPress={() => dispatch({ type: 'removeField', id: field.id })}
          />
        </View>
      </View>

      <Input
        label="Question label"
        value={field.label}
        onChangeText={(label) => dispatch({ type: 'updateField', id: field.id, patch: { label } })}
        autoCapitalize="sentences"
      />

      <View style={styles.toggleRow}>
        <View style={styles.toggle}>
          <Text variant="bodySmall">Required</Text>
          <Switch
            value={field.required ?? false}
            onValueChange={(required) =>
              dispatch({ type: 'updateField', id: field.id, patch: { required } })
            }
          />
        </View>
        <View style={styles.toggle}>
          <Text variant="bodySmall">Staff only</Text>
          <Switch
            value={field.staff_only ?? false}
            onValueChange={(staff_only) =>
              dispatch({ type: 'updateField', id: field.id, patch: { staff_only } })
            }
          />
        </View>
      </View>

      {hasOptions ? <OptionsEditor field={field} dispatch={dispatch} /> : null}
    </View>
  );
}

function OptionsEditor({
  field,
  dispatch,
}: {
  field: Extract<ComplianceField, { type: 'select' | 'multiselect' }>;
  dispatch: Dispatch<FieldBuilderAction>;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.optionsBlock}>
      <Text variant="caption" tone="muted">
        Options
      </Text>
      {field.options.map((o, i) => (
        <View key={i} style={styles.optionRow}>
          <TextInput
            accessibilityLabel={`Option ${i + 1}`}
            value={o.label}
            onChangeText={(label) =>
              dispatch({ type: 'updateOption', id: field.id, index: i, label })
            }
            placeholderTextColor={colors.textMuted}
            style={[
              styles.optionInput,
              { color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.border },
            ]}
          />
          {field.options.length > 1 ? (
            <IconButton
              icon={{ ios: 'xmark', android: 'close', web: 'close' }}
              accessibilityLabel={`Remove option ${i + 1}`}
              size={36}
              iconSize={16}
              onPress={() => dispatch({ type: 'removeOption', id: field.id, index: i })}
            />
          ) : null}
        </View>
      ))}
      <Button
        label="+ Add option"
        variant="ghost"
        size="sm"
        onPress={() => dispatch({ type: 'addOption', id: field.id })}
        style={styles.addOption}
      />
    </View>
  );
}

function ResultMappingEditor({
  selectFields,
  mapping,
  onChange,
}: {
  selectFields: Extract<ComplianceField, { type: 'select' }>[];
  mapping: ComplianceResultMapping | undefined;
  onChange: (m: ComplianceResultMapping | undefined) => void;
}) {
  const { colors } = useTheme();
  const staffSelects = selectFields.filter((f) => f.staff_only);
  const resultField = staffSelects.find((f) => f.id === mapping?.field) ?? null;

  return (
    <View
      style={[styles.mapping, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
      <Text variant="label" color={colors.warning}>
        Pass / fail result
      </Text>
      <Text variant="caption" tone="secondary">
        Choose a staff-only dropdown field, then mark which options count as a pass or a fail.
      </Text>

      {staffSelects.length === 0 ? (
        <Text variant="caption" tone="muted">
          Add a staff-only Dropdown field first, then pick it here.
        </Text>
      ) : (
        <View style={styles.chipWrap}>
          {staffSelects.map((f) => (
            <Chip
              key={f.id}
              label={f.label}
              selected={mapping?.field === f.id}
              onPress={() =>
                onChange(
                  mapping?.field === f.id
                    ? undefined
                    : { field: f.id, pass_values: [], fail_values: [] },
                )
              }
            />
          ))}
        </View>
      )}

      {resultField ? (
        <View style={styles.mappingOptions}>
          {resultField.options.map((o) => {
            const isPass = mapping?.pass_values.includes(o.value) ?? false;
            const isFail = mapping?.fail_values.includes(o.value) ?? false;
            return (
              <View key={o.value} style={styles.mappingRow}>
                <Text variant="bodySmall" style={styles.mappingLabel} numberOfLines={1}>
                  {o.label}
                </Text>
                <View style={styles.bucketRow}>
                  {(['pass', 'fail'] as const).map((bucket) => {
                    const active = bucket === 'pass' ? isPass : isFail;
                    const tint = bucket === 'pass' ? colors.success : colors.danger;
                    return (
                      <Button
                        key={bucket}
                        label={bucket === 'pass' ? 'Pass' : 'Fail'}
                        size="sm"
                        variant={active ? 'primary' : 'secondary'}
                        customColors={
                          active
                            ? { background: tint, text: colors.onColor }
                            : undefined
                        }
                        onPress={() => {
                          if (!mapping) return;
                          const pass = mapping.pass_values.filter((v) => v !== o.value);
                          const fail = mapping.fail_values.filter((v) => v !== o.value);
                          if (bucket === 'pass') pass.push(o.value);
                          else fail.push(o.value);
                          onChange({ field: mapping.field, pass_values: pass, fail_values: fail });
                        }}
                        style={styles.bucketBtn}
                      />
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {mapping && resultField ? (
        <View style={styles.mappingSummary}>
          <Dot color={colors.success} size={6} />
          <Text variant="caption" tone="muted">
            {mapping.pass_values.length} pass · {mapping.fail_values.length} fail
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.base,
  },
  block: {
    gap: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  list: {
    gap: spacing.md,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  typeTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  cardTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.base,
    flexWrap: 'wrap',
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  optionsBlock: {
    gap: spacing.xs,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  optionInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : spacing.xs,
    fontSize: 15,
    minHeight: 40,
  },
  addOption: {
    alignSelf: 'flex-start',
  },
  markdownInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 80,
  },
  mapping: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  mappingOptions: {
    gap: spacing.xs,
  },
  mappingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  mappingLabel: {
    flex: 1,
    minWidth: 0,
  },
  bucketRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  bucketBtn: {
    minWidth: 56,
  },
  mappingSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
