import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { compareCategoryRefs, type ServiceCategoryRef } from '@/lib/booking/service-categories';
import {
  CATEGORY_NAME_MAX,
  useCreateServiceCategory,
  useDeleteServiceCategory,
  useRenameServiceCategory,
  useReorderServiceCategories,
} from '@/lib/queries/useServiceCategories';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * The Categories tab of the Services screen: create, rename, delete and reorder
 * the headings the booking pages group services under. Ports web's
 * `ServiceCategoriesManager`. Writes are admin-only on the server, so other
 * staff see the list read-only; order moves one place at a time and persists
 * the full id order, the same idiom as service reordering here.
 */

function pluralServices(n: number): string {
  return `${n} service${n === 1 ? '' : 's'}`;
}

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback;
}

export interface ServiceCategoriesManagerProps {
  categories: readonly ServiceCategoryRef[];
  /** Services per category id, for the count on each row and the delete warning. */
  serviceCountByCategory: ReadonlyMap<string, number>;
  /** Services with no category, shown as a hint under the list. */
  uncategorisedCount: number;
  isAdmin: boolean;
}

export function ServiceCategoriesManager({
  categories,
  serviceCountByCategory,
  uncategorisedCount,
  isAdmin,
}: ServiceCategoriesManagerProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const create = useCreateServiceCategory();
  const rename = useRenameServiceCategory();
  const remove = useDeleteServiceCategory();
  const reorder = useReorderServiceCategories();

  const sorted = [...categories].sort(compareCategoryRefs);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ServiceCategoryRef | null>(null);
  const busy = create.isPending || rename.isPending || remove.isPending || reorder.isPending;

  const submitCreate = () => {
    const name = newName.trim();
    if (!name) return;
    create.mutate(name, {
      onSuccess: () => setNewName(''),
      onError: (e) => toast.error(errorMessage(e, 'Could not create the category.')),
    });
  };

  const startRename = (category: ServiceCategoryRef) => {
    setEditingId(category.id);
    setEditingName(category.name);
  };

  const commitRename = () => {
    if (!editingId) return;
    const name = editingName.trim();
    const current = sorted.find((c) => c.id === editingId);
    if (!name || !current || name === current.name) {
      setEditingId(null);
      return;
    }
    rename.mutate(
      { id: editingId, name },
      {
        onSuccess: () => setEditingId(null),
        onError: (e) => toast.error(errorMessage(e, 'Could not rename the category.')),
      },
    );
  };

  const move = (categoryId: string, direction: -1 | 1) => {
    const ids = sorted.map((c) => c.id);
    const from = ids.indexOf(categoryId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, categoryId);
    reorder.mutate(next, {
      onError: (e) => toast.error(errorMessage(e, 'Could not save the new order.')),
    });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    remove.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
      onError: (e) => toast.error(errorMessage(e, 'Could not delete the category.')),
    });
  };

  const deleteCount = deleteTarget ? serviceCountByCategory.get(deleteTarget.id) ?? 0 : 0;

  return (
    <View style={styles.panel}>
      <Text variant="caption" tone="muted">
        Group your services under headings on the booking page, the staff booking form and this
        list. A venue with no categories keeps one flat list.
      </Text>

      {isAdmin ? (
        <View style={styles.addRow}>
          <Input
            label="New category"
            placeholder="e.g. Hair, Nails, Massage"
            value={newName}
            onChangeText={setNewName}
            maxLength={CATEGORY_NAME_MAX}
            returnKeyType="done"
            onSubmitEditing={submitCreate}
            containerStyle={styles.flex1}
          />
          <Button
            label="Add"
            onPress={submitCreate}
            disabled={!newName.trim() || busy}
            loading={create.isPending}
          />
        </View>
      ) : null}

      {sorted.length === 0 ? (
        <EmptyState
          title="No categories yet"
          message={
            isAdmin
              ? 'Add your first category above, then choose a category on each service.'
              : 'Your venue admin has not created any categories yet.'
          }
        />
      ) : (
        <Card padded={false}>
          {sorted.map((category, index) => {
            const count = serviceCountByCategory.get(category.id) ?? 0;
            const editing = editingId === category.id;
            return (
              <View
                key={category.id}
                style={[
                  styles.row,
                  index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                ]}>
                {editing ? (
                  <View style={styles.editBlock}>
                    <Input
                      label="Category name"
                      value={editingName}
                      onChangeText={setEditingName}
                      maxLength={CATEGORY_NAME_MAX}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={commitRename}
                    />
                    <View style={styles.editActions}>
                      <Button
                        label="Save"
                        size="sm"
                        onPress={commitRename}
                        loading={rename.isPending}
                        disabled={!editingName.trim()}
                      />
                      <Button label="Cancel" size="sm" variant="ghost" onPress={() => setEditingId(null)} />
                    </View>
                  </View>
                ) : (
                  <>
                    <View style={styles.rowText}>
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {category.name}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {pluralServices(count)}
                      </Text>
                    </View>
                    {isAdmin ? (
                      <View style={styles.rowActions}>
                        <IconButton
                          icon={{ ios: 'chevron.up', android: 'expand_less', web: 'expand_less' }}
                          accessibilityLabel={`Move ${category.name} up`}
                          disabled={index === 0 || busy}
                          onPress={() => move(category.id, -1)}
                        />
                        <IconButton
                          icon={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
                          accessibilityLabel={`Move ${category.name} down`}
                          disabled={index === sorted.length - 1 || busy}
                          onPress={() => move(category.id, 1)}
                        />
                        <IconButton
                          icon={{ ios: 'pencil', android: 'edit', web: 'edit' }}
                          accessibilityLabel={`Rename ${category.name}`}
                          disabled={busy}
                          onPress={() => startRename(category)}
                        />
                        <IconButton
                          icon={{ ios: 'trash', android: 'delete', web: 'delete' }}
                          accessibilityLabel={`Delete ${category.name}`}
                          tint={colors.danger}
                          disabled={busy}
                          onPress={() => setDeleteTarget(category)}
                        />
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            );
          })}
        </Card>
      )}

      {sorted.length > 0 ? (
        <Text variant="caption" tone="muted">
          {uncategorisedCount === 0
            ? 'Every service has a category.'
            : `${pluralServices(uncategorisedCount)} without a category will be listed last, under "Other services". Set a category on each service from the Services tab.`}
          {' '}Choose sections or collapsible headings under Booking page.
        </Text>
      ) : null}

      <ConfirmSheet
        visible={deleteTarget !== null}
        title={deleteTarget ? `Delete "${deleteTarget.name}"?` : 'Delete category?'}
        message={
          deleteCount > 0
            ? `${pluralServices(deleteCount)} will stay bookable and move to "Other services" on your booking page. Nothing about a service is deleted.`
            : 'No services use this category. Nothing else changes.'
        }
        confirmLabel="Delete category"
        destructive
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => {
          if (!remove.isPending) setDeleteTarget(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.base,
  },
  flex1: {
    flex: 1,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editBlock: {
    flex: 1,
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
