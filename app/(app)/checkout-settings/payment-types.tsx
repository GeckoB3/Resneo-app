import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NameSheet } from '@/components/pos/settings/NameSheet';
import {
  CheckoutSettingsShell,
  FormSection,
  SwitchRow,
  useCheckoutSettingsCtx,
} from '@/components/pos/settings/SettingsParts';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Text } from '@/components/ui/Text';
import { SETTINGS_COPY } from '@/lib/pos/settings-copy';
import { missingPaymentTypeSuggestions, reorderWrites } from '@/lib/pos/settings-lists';
import { settingsPaths, useSettingsPaymentTypes, useSettingsWrite, type WriteResult } from '@/lib/queries/useCheckoutSettings';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosSettingsPaymentType } from '@/types/pos-settings';

/**
 * Other payment types (web `PaymentTypesCard.tsx`, UX spec §9.6, plan §4.4.7): the list in till
 * order, each with "Ask for a reference" and "Show at the till", rename, move up or down, and
 * remove (a type payments already use is switched off instead, and the server says so). The
 * suggestions show as one-tap buttons for any the venue does not have; "Paper voucher" only while
 * gift vouchers are off. Every change carries the type's `version`.
 */

export default function PaymentTypesSettingsScreen() {
  return (
    <CheckoutSettingsShell title={SETTINGS_COPY['set.ptypes.title']}>
      <PaymentTypesSection />
    </CheckoutSettingsShell>
  );
}

function PaymentTypesSection() {
  const { t, canEdit, vouchersEnabled } = useCheckoutSettingsCtx();
  const { colors } = useTheme();
  const toast = useToast();
  const list = useSettingsPaymentTypes();
  const write = useSettingsWrite();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newRef, setNewRef] = useState(false);
  const [renaming, setRenaming] = useState<PosSettingsPaymentType | null>(null);
  const [removing, setRemoving] = useState<PosSettingsPaymentType | null>(null);
  const types = list.data ?? null;

  const afterWrite = async (r: WriteResult<unknown>, saved: string) => {
    if (r.ok) {
      setError(null);
      toast.success(saved);
    } else setError(r.message);
    await list.refetch();
  };

  const patch = async (p: PosSettingsPaymentType, body: Partial<PosSettingsPaymentType>, saved = t('set.ptypes.saved')) => {
    setBusy(true);
    const r = await write(settingsPaths.paymentType(p.id), 'PATCH', { ...body, version: p.version });
    setBusy(false);
    await afterWrite(r, saved);
  };

  const create = async (name: string, requiresReference: boolean) => {
    setBusy(true);
    const r = await write(settingsPaths.paymentTypes, 'POST', { name, requires_reference: requiresReference });
    setBusy(false);
    if (r.ok) await afterWrite(r, t('set.ptypes.added', { name }));
    return r;
  };

  const move = async (index: number, delta: -1 | 1) => {
    if (!types) return;
    const writes = reorderWrites(types, index, delta);
    if (writes.length === 0) return;
    setBusy(true);
    let last: WriteResult<unknown> = { ok: true, body: {} };
    for (const w of writes) {
      const r = await write(settingsPaths.paymentType(w.id), 'PATCH', { version: w.version, sort_order: w.sort_order });
      if (!r.ok) {
        last = r;
        break;
      }
    }
    setBusy(false);
    await afterWrite(last, t('set.ptypes.orderSaved'));
  };

  const remove = async () => {
    const p = removing;
    if (!p) return;
    setBusy(true);
    const r = await write<{ switched_off?: boolean }>(settingsPaths.withVersion(settingsPaths.paymentType(p.id), p.version), 'DELETE');
    setBusy(false);
    setRemoving(null);
    await afterWrite(r, r.ok && r.body.switched_off ? t('set.ptypes.switchedOff', { name: p.name }) : t('set.ptypes.removed', { name: p.name }));
  };

  const missing = missingPaymentTypeSuggestions(types ?? [], vouchersEnabled);

  return (
    <>
      <FormSection title={t('set.ptypes.title')} description={t('set.ptypes.help')} error={error ?? (list.isError ? t('common.networkError') : null)}>
        {list.isLoading ? (
          <Text variant="bodySmall" tone="muted">
            {t('common.loading')}
          </Text>
        ) : null}
        {types && types.length > 0 ? (
          <View>
            {types.map((p, i) => (
              <View key={p.id} style={[styles.row, i > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]}>
                <Text variant="bodyMedium">{p.name}</Text>
                {canEdit ? (
                  // One row of matching small buttons: move up, move down, rename, remove.
                  <View style={styles.inline}>
                    <Button
                      label="↑"
                      accessibilityLabel={t('set.ptypes.moveUp', { name: p.name })}
                      variant="secondary"
                      size="sm"
                      disabled={busy || i === 0}
                      onPress={() => void move(i, -1)}
                    />
                    <Button
                      label="↓"
                      accessibilityLabel={t('set.ptypes.moveDown', { name: p.name })}
                      variant="secondary"
                      size="sm"
                      disabled={busy || i === types.length - 1}
                      onPress={() => void move(i, 1)}
                    />
                    <Button label={t('set.ptypes.rename')} variant="secondary" size="sm" disabled={busy} onPress={() => setRenaming(p)} />
                    <Button label={t('set.ptypes.remove')} variant="secondary" size="sm" disabled={busy} onPress={() => setRemoving(p)} />
                  </View>
                ) : null}
                <SwitchRow
                  label={t('set.ptypes.ref')}
                  value={p.requires_reference}
                  disabled={!canEdit || busy}
                  onChange={(x) => void patch(p, { requires_reference: x })}
                />
                <SwitchRow
                  label={t('set.ptypes.active')}
                  value={p.is_active}
                  disabled={!canEdit || busy}
                  onChange={(x) => void patch(p, { is_active: x })}
                />
              </View>
            ))}
          </View>
        ) : null}

        {canEdit && types && missing.length > 0 ? (
          <View style={styles.stack}>
            <Text variant="bodySmall">{t('set.ptypes.suggest')}</Text>
            <View style={styles.inline}>
              {missing.map((s) => (
                <Button
                  key={s}
                  label={`+ ${s}`}
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onPress={() =>
                    void create(s, false).then((r) => {
                      if (!r.ok) setError(r.message);
                    })
                  }
                />
              ))}
            </View>
          </View>
        ) : null}

        {canEdit ? (
          <Button
            label={t('set.ptypes.add')}
            variant="secondary"
            onPress={() => {
              setNewRef(false);
              setAdding(true);
            }}
          />
        ) : null}
      </FormSection>

      <NameSheet
        visible={adding}
        title={t('set.ptypes.add')}
        label={t('set.ptypes.name')}
        initial={null}
        maxLength={40}
        onClose={() => setAdding(false)}
        onSave={async (name) => {
          const r = await create(name, newRef);
          if (r.ok) {
            setAdding(false);
            return null;
          }
          return { message: r.message, field: r.fields.some((f) => f.path === 'name') };
        }}>
        <SwitchRow label={t('set.ptypes.ref')} value={newRef} onChange={setNewRef} />
      </NameSheet>

      <NameSheet
        visible={renaming !== null}
        title={t('set.ptypes.rename.title')}
        label={t('set.ptypes.name')}
        initial={renaming?.name ?? null}
        maxLength={40}
        onClose={() => setRenaming(null)}
        onSave={async (name) => {
          if (!renaming) return null;
          if (name === renaming.name) {
            setRenaming(null);
            return null;
          }
          setBusy(true);
          const r = await write(settingsPaths.paymentType(renaming.id), 'PATCH', { name, version: renaming.version });
          setBusy(false);
          const fresh = r.ok || (!r.ok && r.stale) ? await list.refetch() : null;
          if (!r.ok && r.stale) {
            // Keep the sheet on the fresh row so the next save carries its version.
            const next = fresh?.data?.find((x) => x.id === renaming.id);
            if (next) setRenaming(next);
          }
          if (r.ok) {
            setError(null);
            toast.success(t('set.ptypes.saved'));
            setRenaming(null);
            return null;
          }
          return { message: r.message, field: r.fields.some((f) => f.path === 'name') };
        }}
      />

      <ConfirmSheet
        visible={removing !== null}
        title={removing ? t('set.ptypes.remove.title', { name: removing.name }) : ''}
        message={removing ? t('set.ptypes.remove.body', { name: removing.name }) : undefined}
        confirmLabel={t('set.ptypes.remove')}
        cancelLabel={t('common.cancel')}
        loading={busy}
        onConfirm={() => void remove()}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  row: { paddingVertical: spacing.md, gap: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
});
