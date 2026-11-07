import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  useComplianceLibrary,
  type ComplianceLibraryTemplate,
} from '@/lib/queries/useComplianceTypeManage';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

import {
  CATEGORY_LABELS,
  FIELD_TYPE_LABELS,
  RESULT_TYPE_LABELS,
  validityLabel,
} from './complianceTypeLabels';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** A template was picked: open the form builder with a copy of it (web parity, 2026-11-07). */
  onUseTemplate: (template: ComplianceLibraryTemplate) => void;
};

/**
 * "Add from library" sheet: lists the built-in starter compliance templates (GET /library). "Use
 * template" opens the form builder with a copy of one, to change before it is created as the
 * venue's own form, as on the web. The template itself never changes.
 */
export function ComplianceLibrarySheet({ visible, onClose, onUseTemplate }: Props) {
  const { colors } = useTheme();
  const library = useComplianceLibrary(visible);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);

  const templates = library.data?.templates ?? [];

  return (
    <Sheet visible={visible} onClose={onClose} fill maxHeight="88%">
      <View style={styles.header}>
        <Text variant="subheading">Add from library</Text>
        <Text variant="bodySmall" tone="muted">
          Pick a template to open it in the form builder. Change anything you like before you create it; the template itself stays as it is.
        </Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        {library.isLoading ? (
          <Text variant="bodySmall" tone="muted">
            Loading library…
          </Text>
        ) : library.isError ? (
          <Text variant="bodySmall" tone="danger">
            {library.error instanceof ApiError ? library.error.message : 'Could not load the library.'}
          </Text>
        ) : templates.length === 0 ? (
          <Text variant="bodySmall" tone="muted">
            No library templates are available.
          </Text>
        ) : (
          templates.map((t) => {
            const previewFields = t.form_schema?.fields ?? [];
            const showPreview = previewSlug === t.slug;
            return (
              <View
                key={t.slug}
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardText}>
                    <Text variant="bodyMedium" numberOfLines={1}>
                      {t.name}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={2}>
                      {[
                        CATEGORY_LABELS[t.category] ?? t.category,
                        RESULT_TYPE_LABELS[t.result_type] ?? t.result_type,
                        validityLabel(t.validity_period_days),
                        `${t.field_count} question${t.field_count === 1 ? '' : 's'}`,
                      ].join(' · ')}
                    </Text>
                    {t.description ? (
                      <Text variant="caption" tone="muted" numberOfLines={2}>
                        {t.description}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.cardActions}>
                    {previewFields.length > 0 ? (
                      <Button
                        label={showPreview ? 'Hide' : 'Preview'}
                        variant="ghost"
                        size="sm"
                        onPress={() => setPreviewSlug(showPreview ? null : t.slug)}
                      />
                    ) : null}
                    <Button label="Use template" size="sm" onPress={() => onUseTemplate(t)} />
                  </View>
                </View>
                {showPreview && previewFields.length > 0 ? (
                  <View style={[styles.preview, { borderTopColor: colors.border }]}>
                    {previewFields.map((f, idx) => (
                      <View
                        key={f.id}
                        style={[
                          styles.previewRow,
                          idx > 0 && {
                            borderTopColor: colors.border,
                            borderTopWidth: StyleSheet.hairlineWidth,
                          },
                        ]}>
                        <Text variant="bodySmall" numberOfLines={2}>
                          {f.label}
                        </Text>
                        <Text variant="caption" tone="muted">
                          {FIELD_TYPE_LABELS[f.type] ?? f.type}
                          {f.required ? ' · required' : ''}
                          {f.staff_only ? ' · staff only' : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
        <View style={styles.spacer} />
      </ScrollView>

      <View
        style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
        <Button label="Close" variant="secondary" fullWidth onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  card: {
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  cardActions: {
    gap: spacing.xs,
    alignItems: 'flex-end',
  },
  preview: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  previewRow: {
    paddingVertical: spacing.xs,
    gap: 1,
  },
  footer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  spacer: {
    height: spacing.lg,
  },
});
