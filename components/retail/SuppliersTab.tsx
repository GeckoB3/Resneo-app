import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AmountRow, ErrorLine, money, Notice, PosSheet, posStyles } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmPanel } from '@/components/ui/ConfirmPanel';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { penceToInput } from '@/lib/pos/sale-math';
import { supplierBody, type SupplierForm } from '@/lib/retail/supplier-form';
import { useStockT } from '@/lib/retail/stock-setup-copy';
import { SupplierStaleError, useSaveSupplier, useSupplierOpenOrders, useSupplierRows } from '@/lib/queries/useStockSetup';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import type { RetailSupplier } from '@/types/retail';

/**
 * The Suppliers tab in the app (UX spec §6.12; plan §4.14, P5-1), as the web's `SuppliersTab.tsx`:
 * name, contact, email, delivery time and open orders, with `sup.add`. Adding, editing and
 * archiving need `manage_suppliers`; everyone else sees the list (`sup.readOnly`). The editor
 * carries every supplier field and the row's `version`; a 412 loads the other person's version and
 * says so. Archiving asks `sup.archive.title` first and keeps the supplier's orders in the records.
 */
export function SuppliersTab({ canManage }: { canManage: boolean }) {
  const t = useStockT();
  const list = useSupplierRows();
  const open = useSupplierOpenOrders();
  const [editing, setEditing] = useState<RetailSupplier | 'new' | null>(null);
  const rows = (list.data ?? []).filter((s) => !s.archived_at);

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching}
            onRefresh={() => {
              void list.refetch();
              void open.refetch();
            }}
          />
        }>
        {canManage ? (
          <Button label={t('sup.add')} onPress={() => setEditing('new')} fullWidth />
        ) : (
          <Text variant="bodySmall" tone="muted">
            {t('sup.readOnly')}
          </Text>
        )}
        {list.isLoading ? (
          <ListSkeleton />
        ) : list.isError && !list.data ? (
          <ErrorState message={posErrorMessage(list.error, t('sup.error'))} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title={t('sup.empty.title')} message={t('sup.empty.body')} />
        ) : (
          rows.map((s) => (
            <Card key={s.id}>
              <View style={posStyles.stack}>
                <View style={posStyles.row}>
                  <View style={styles.flex}>
                    <Text variant="label">{s.name}</Text>
                    {s.contact_name || s.email ? (
                      <Text variant="caption" tone="muted">
                        {[s.contact_name, s.email].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                  {canManage ? (
                    <Button
                      label={t('sup.edit')}
                      size="sm"
                      variant="secondary"
                      accessibilityLabel={`${t('sup.edit')} ${s.name}`}
                      onPress={() => setEditing(s)}
                    />
                  ) : null}
                </View>
                <AmountRow
                  label={t('sup.col.leadTime')}
                  amount={s.lead_time_days == null ? '' : t('sup.leadTime.days', { count: s.lead_time_days })}
                  muted
                />
                <AmountRow label={t('sup.col.open')} amount={String(open.data?.[s.id] ?? 0)} muted />
              </View>
            </Card>
          ))
        )}
      </ScrollView>
      <SupplierSheet supplier={editing} onClose={() => setEditing(null)} />
    </>
  );
}

/** Add (`supplier` 'new') or edit one supplier. */
export function SupplierSheet({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: RetailSupplier | 'new' | null;
  onClose: () => void;
  onSaved?: (row: RetailSupplier) => void;
}) {
  if (!supplier) return null;
  return (
    <SupplierBody
      key={supplier === 'new' ? 'new' : supplier.id}
      supplier={supplier === 'new' ? null : supplier}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function formFrom(s: RetailSupplier | null): SupplierForm {
  return {
    name: s?.name ?? '',
    contact_name: s?.contact_name ?? '',
    email: s?.email ?? '',
    phone: s?.phone ?? '',
    account_number: s?.account_number ?? '',
    lead_time_days: s?.lead_time_days == null ? '' : String(s.lead_time_days),
    min_order: s?.min_order_pence == null ? '' : penceToInput(s.min_order_pence),
    notes: s?.notes ?? '',
  };
}

function SupplierBody({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: RetailSupplier | null;
  onClose: () => void;
  onSaved?: (row: RetailSupplier) => void;
}) {
  const t = useStockT();
  const toast = useToast();
  const save = useSaveSupplier();
  const [f, setF] = useState<SupplierForm>(() => formFrom(supplier));
  const [version, setVersion] = useState(supplier?.version ?? 1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [archiving, setArchiving] = useState(false);
  const set = (k: keyof SupplierForm) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  async function onSave() {
    const built = supplierBody(f, {
      nameRequired: t('sup.name.required'),
      minOrderInvalid: t('sup.minOrder.invalid'),
      leadTimeInvalid: t('sup.leadTime.invalid'),
    });
    setFieldErrors(built.errors);
    if (!built.body) return;
    setError(null);
    setNotice(null);
    try {
      const row = await save.mutateAsync(
        supplier ? { kind: 'update', id: supplier.id, version, body: built.body } : { kind: 'create', body: built.body },
      );
      toast.success(t('sup.saved'));
      onSaved?.(row);
      onClose();
    } catch (e) {
      if (e instanceof SupplierStaleError) {
        if (e.item) {
          setVersion(e.item.version ?? version);
          setF(formFrom(e.item));
        }
        setNotice(e.message);
        return;
      }
      const body = (e as { body?: { fields?: { path: string; message: string }[] } }).body;
      if (Array.isArray(body?.fields) && body.fields.length) {
        setFieldErrors(Object.fromEntries(body.fields.map((x) => [x.path, x.message])));
      }
      setError(posErrorMessage(e, t('common.networkError')));
    }
  }

  async function onArchive() {
    if (!supplier) return;
    setError(null);
    try {
      const row = await save.mutateAsync({ kind: 'archive', id: supplier.id, version });
      toast.success(t('sup.archived'));
      onSaved?.(row);
      onClose();
    } catch (e) {
      setArchiving(false);
      if (e instanceof SupplierStaleError && e.item) setVersion(e.item.version ?? version);
      setError(posErrorMessage(e, t('common.networkError')));
    }
  }

  return (
    <PosSheet
      visible
      onClose={() => {
        if (!save.isPending) onClose();
      }}
      title={supplier ? t('sup.edit.title') : t('sup.add.title')}
      footer={
        <View style={posStyles.buttons}>
          <Button label={t('common.save')} loading={save.isPending && !archiving} disabled={save.isPending} onPress={() => void onSave()} fullWidth />
          {supplier && !archiving ? (
            <Button label={t('sup.archive')} variant="ghost" disabled={save.isPending} onPress={() => setArchiving(true)} fullWidth />
          ) : null}
          <Button label={t('common.cancel')} variant="ghost" disabled={save.isPending} onPress={onClose} fullWidth />
        </View>
      }>
      {notice ? <Notice tone="warning">{notice}</Notice> : null}
      <Input
        label={t('sup.f.name')}
        accessibilityLabel={t('sup.f.name')}
        value={f.name}
        onChangeText={set('name')}
        maxLength={120}
        error={fieldErrors.name}
        required
        autoComplete="organization"
      />
      <Input
        label={t('sup.f.contact')}
        accessibilityLabel={t('sup.f.contact')}
        value={f.contact_name}
        onChangeText={set('contact_name')}
        maxLength={120}
        error={fieldErrors.contact_name}
      />
      <Input
        label={t('sup.f.email')}
        accessibilityLabel={t('sup.f.email')}
        value={f.email}
        onChangeText={set('email')}
        maxLength={254}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        error={fieldErrors.email}
      />
      <Input
        label={t('sup.f.phone')}
        accessibilityLabel={t('sup.f.phone')}
        value={f.phone}
        onChangeText={set('phone')}
        maxLength={40}
        keyboardType="phone-pad"
        error={fieldErrors.phone}
      />
      <Input
        label={t('sup.f.account')}
        accessibilityLabel={t('sup.f.account')}
        value={f.account_number}
        onChangeText={set('account_number')}
        maxLength={60}
        autoCorrect={false}
        error={fieldErrors.account_number}
      />
      <Input
        label={t('sup.f.leadTime')}
        accessibilityLabel={t('sup.f.leadTime')}
        value={f.lead_time_days}
        onChangeText={set('lead_time_days')}
        keyboardType="number-pad"
        error={fieldErrors.lead_time_days}
      />
      <Input
        label={t('sup.f.minOrder')}
        accessibilityLabel={t('sup.f.minOrder')}
        value={f.min_order}
        onChangeText={set('min_order')}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder={money(0).replace(/[\d.,]/g, '')}
        error={fieldErrors.min_order ?? fieldErrors.min_order_pence}
      />
      <Input
        label={t('sup.f.notes')}
        accessibilityLabel={t('sup.f.notes')}
        value={f.notes}
        onChangeText={set('notes')}
        maxLength={2000}
        multiline
        error={fieldErrors.notes}
      />
      <ErrorLine message={error} />
      {archiving ? (
        <ConfirmPanel
          title={t('sup.archive.title', { supplier: supplier?.name ?? '' })}
          message={t('sup.archive.body')}
          confirmLabel={t('sup.archive')}
          cancelLabel={t('common.cancel')}
          destructive
          loading={save.isPending}
          onConfirm={() => void onArchive()}
          onCancel={() => setArchiving(false)}
        />
      ) : null}
    </PosSheet>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
  flex: { flex: 1 },
});
