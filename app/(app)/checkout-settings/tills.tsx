import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NameSheet } from '@/components/pos/settings/NameSheet';
import {
  CheckoutSettingsShell,
  FormSection,
  SwitchRow,
  useCheckoutSettingsCtx,
} from '@/components/pos/settings/SettingsParts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Text } from '@/components/ui/Text';
import { SETTINGS_COPY } from '@/lib/pos/settings-copy';
import {
  settingsPaths,
  useReloadCheckoutSettings,
  useSettingsTills,
  useSettingsWrite,
  type WriteResult,
} from '@/lib/queries/useCheckoutSettings';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosSettingsTill } from '@/types/pos-settings';

/**
 * Tills (web `TillsCard.tsx`, UX spec §9.8, plan §4.10 and §4.37). While Use more than one till is
 * off, only `set.tills.single` shows, with "Add another till", which asks first and then adds the
 * till; the server turns the switch on when a second till comes into use. With it on, every till is
 * listed: rename, the cash drawer, In use, and (the app's addition, on the same route the web
 * serves) Remove. Every change carries the till's `version`. The server refuses switching off or
 * removing the last till in use, or a till with an open session (`set.tills.openSession`), and its
 * sentence shows. A till's default card reader is chosen in Card readers.
 */

export default function TillsSettingsScreen() {
  return (
    <CheckoutSettingsShell title={SETTINGS_COPY['set.tills.title']}>
      <TillsSection />
    </CheckoutSettingsShell>
  );
}

function TillsSection() {
  const { data, t, canEdit } = useCheckoutSettingsCtx();
  const { colors } = useTheme();
  const toast = useToast();
  const list = useSettingsTills();
  const write = useSettingsWrite();
  const reloadSettings = useReloadCheckoutSettings();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmAnother, setConfirmAnother] = useState(false);
  const [adding, setAdding] = useState(false);
  const [drawer, setDrawer] = useState(true);
  const [renaming, setRenaming] = useState<PosSettingsTill | null>(null);
  const [removing, setRemoving] = useState<PosSettingsTill | null>(null);
  const multiple = data.settings.multiple_tills_enabled;
  const tills = list.data ?? null;

  const afterWrite = async (r: WriteResult<unknown>, saved: string) => {
    if (r.ok) {
      setError(null);
      toast.success(saved);
    } else setError(r.message);
    await list.refetch();
  };

  const patch = async (till: PosSettingsTill, body: Partial<PosSettingsTill>) => {
    setBusy(true);
    const r = await write(settingsPaths.till(till.id), 'PATCH', { ...body, version: till.version });
    setBusy(false);
    await afterWrite(r, t('set.tills.saved'));
  };

  const openAdd = () => {
    if (!multiple) {
      setConfirmAnother(true);
      return;
    }
    setDrawer(true);
    setAdding(true);
  };

  const remove = async () => {
    const till = removing;
    if (!till) return;
    setBusy(true);
    const r = await write<{ switched_off?: boolean }>(settingsPaths.withVersion(settingsPaths.till(till.id), till.version), 'DELETE');
    setBusy(false);
    setRemoving(null);
    await afterWrite(r, r.ok && r.body.switched_off ? t('set.tills.switchedOff', { name: till.name }) : t('set.tills.removed', { name: till.name }));
  };

  const active = (tills ?? []).filter((x) => x.is_active);
  const single = active[0] ?? null;

  return (
    <>
      <FormSection title={t('set.tills.title')} description={t('set.tills.help')} error={error ?? (list.isError ? t('common.networkError') : null)}>
        {list.isLoading ? (
          <Text variant="bodySmall" tone="muted">
            {t('common.loading')}
          </Text>
        ) : null}

        {tills && !multiple ? (
          <Text variant="bodySmall">{t('set.tills.single', { till: single?.name ?? t('set.tills.singleDefault') })}</Text>
        ) : null}

        {tills && multiple ? (
          <View>
            {tills.map((till, i) => (
              <View key={till.id} style={[styles.row, i > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]}>
                <View style={styles.inline}>
                  <Text variant="bodyMedium">{till.name}</Text>
                  {!till.is_active ? <Badge label={t('set.tills.notInUse')} /> : null}
                </View>
                {canEdit ? (
                  <View style={styles.inline}>
                    <Button label={t('set.tills.rename')} variant="secondary" size="sm" disabled={busy} onPress={() => setRenaming(till)} />
                    <Button label={t('set.tills.remove')} variant="ghost" size="sm" disabled={busy} onPress={() => setRemoving(till)} />
                  </View>
                ) : null}
                <SwitchRow
                  label={t('set.tills.drawer')}
                  value={till.has_cash_drawer}
                  disabled={!canEdit || busy}
                  onChange={(x) => void patch(till, { has_cash_drawer: x })}
                />
                <SwitchRow
                  label={t('set.tills.active')}
                  value={till.is_active}
                  disabled={!canEdit || busy}
                  onChange={(x) => void patch(till, { is_active: x })}
                />
              </View>
            ))}
          </View>
        ) : null}

        {canEdit && tills ? (
          <Button
            label={multiple ? t('set.tills.add') : t('set.tills.addAnother')}
            variant="secondary"
            disabled={busy}
            onPress={openAdd}
          />
        ) : null}
      </FormSection>

      <ConfirmSheet
        visible={confirmAnother}
        title={t('feat.tills.on.title')}
        message={t('feat.tills.on.body')}
        confirmLabel={t('set.tills.addAnother')}
        cancelLabel={t('common.cancel')}
        destructive={false}
        onConfirm={() => {
          setConfirmAnother(false);
          setDrawer(true);
          setAdding(true);
        }}
        onClose={() => setConfirmAnother(false)}
      />

      <NameSheet
        visible={adding}
        title={t('set.tills.add')}
        label={t('set.tills.name')}
        initial={null}
        maxLength={60}
        onClose={() => setAdding(false)}
        onSave={async (name) => {
          setBusy(true);
          const r = await write<{ multiple_tills_enabled?: boolean }>(settingsPaths.tills, 'POST', { name, has_cash_drawer: drawer });
          setBusy(false);
          if (!r.ok) return { message: r.message, field: r.fields.length > 0 };
          setAdding(false);
          setError(null);
          toast.success(t('set.tills.added', { name }));
          await list.refetch();
          if (r.body.multiple_tills_enabled && !multiple) await reloadSettings();
          return null;
        }}>
        <SwitchRow label={t('set.tills.drawer')} value={drawer} onChange={setDrawer} />
      </NameSheet>

      <NameSheet
        visible={renaming !== null}
        title={t('set.tills.rename.title')}
        label={t('set.tills.name')}
        initial={renaming?.name ?? null}
        maxLength={60}
        onClose={() => setRenaming(null)}
        onSave={async (name) => {
          if (!renaming) return null;
          if (name === renaming.name) {
            setRenaming(null);
            return null;
          }
          setBusy(true);
          const r = await write(settingsPaths.till(renaming.id), 'PATCH', { name, version: renaming.version });
          setBusy(false);
          if (r.ok) {
            setRenaming(null);
            setError(null);
            toast.success(t('set.tills.saved'));
            await list.refetch();
            return null;
          }
          if (r.stale) {
            // Keep the sheet on the fresh row so the next save carries its version.
            const fresh = await list.refetch();
            const next = fresh.data?.find((x) => x.id === renaming.id);
            if (next) setRenaming(next);
          }
          return { message: r.message, field: r.fields.some((f) => f.path === 'name') };
        }}
      />

      <ConfirmSheet
        visible={removing !== null}
        title={removing ? t('set.tills.remove.title', { name: removing.name }) : ''}
        message={removing ? t('set.tills.remove.body', { name: removing.name }) : undefined}
        confirmLabel={t('set.tills.remove')}
        cancelLabel={t('common.cancel')}
        loading={busy}
        onConfirm={() => void remove()}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: spacing.md, gap: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
});
