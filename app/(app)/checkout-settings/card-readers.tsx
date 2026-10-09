import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PickRow, PosSheet } from '@/components/pos/parts';
import {
  FieldBlock,
  MessageBox,
  SettingsCard,
  SettingsScreen,
  SettingsScroll,
  settingsStyles,
} from '@/components/pos/settings-more/parts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { posFetch } from '@/lib/pos/api';
import { queryKeys } from '@/lib/queries/keys';
import { usePosGate } from '@/lib/queries/usePos';
import { settingsErrorCode, settingsErrorMessage, settingsMorePaths } from '@/lib/pos/settings-more/api';
import { smT } from '@/lib/pos/settings-more/copy';
import { settingsMoreKeys, useSettingsQuery, useSettingsSend } from '@/lib/pos/settings-more/hooks';
import { lastSeenText, readerModelLabel, readersT } from '@/lib/pos/settings-more/readers-copy';
import type { CardReader, CardReaderList, PosSettingsResponse, TillOption } from '@/lib/pos/settings-more/types';
import { spacing } from '@/theme/index';

/**
 * Settings, Checkout: Card readers in the app (web `CardReadersSection`, UX spec §9.8; plan §4.4.2
 * step 1, P2-1, P2-3). Shown to admins and to logins with `manage_readers`, as the web shows it.
 * Lists the venue's counter readers with their type, live status (asked of Stripe when the screen
 * opens), last seen time and till; adds one by its pairing code, renames it, chooses the till that
 * uses it, and removes it (asking first, unless it already moved away). A reader registered away
 * by another business shows "Moved away" until it is cleared. In test mode a simulated reader can
 * be added and given a test card.
 */

/** Who sees the card: admins, and staff with `manage_readers` (web `showReaders`). */
export function canManageReaders(data: PosSettingsResponse): boolean {
  return data.can.is_admin || data.staff_capability_map?.manage_readers === true;
}

function movedDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
  } catch {
    return '';
  }
}

function StatusBadge({ reader }: { reader: CardReader }) {
  if (!reader.is_active) return <Badge label={readersT('set.readers.movedPill')} tone="warning" />;
  if (reader.busy) return <Badge label={readersT('reader.status.busy')} tone="brand" />;
  if (reader.status === 'online') return <Badge label={readersT('reader.status.online')} tone="success" />;
  if (reader.status === 'offline') return <Badge label={readersT('reader.status.offline')} tone="danger" />;
  return null;
}

export default function CardReadersScreen() {
  return (
    <SettingsScreen title={readersT('set.readers.title')} gate={(data) => (canManageReaders(data) ? 'ok' : 'admin_only')}>
      {(data) => <CardReadersBody venueName={data.venue.name} />}
    </SettingsScreen>
  );
}

function CardReadersBody({ venueName }: { venueName: string }) {
  const { accessToken, enabled } = usePosGate();
  const queryClient = useQueryClient();
  const send = useSettingsSend();
  // Status is asked of Stripe when the screen opens and on "Check status" (`?refresh=1`); after a
  // change the list is read without asking Stripe again, as the web does.
  const withStatus = useRef(true);
  const list = useQuery({
    queryKey: settingsMoreKeys.readers(accessToken),
    enabled,
    staleTime: 0,
    retry: false,
    queryFn: () => {
      const path = settingsMorePaths.readers(withStatus.current);
      withStatus.current = false;
      return posFetch<CardReaderList>(path, { accessToken: accessToken! });
    },
  });
  const tillsQuery = useSettingsQuery<{ tills: TillOption[] }>(settingsMoreKeys.tills, settingsMorePaths.tills);
  const tills = (tillsQuery.data?.tills ?? []).filter((t) => t.is_active !== false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ code: string } | null>(null);
  const [renaming, setRenaming] = useState<CardReader | null>(null);
  const [removing, setRemoving] = useState<CardReader | null>(null);
  const [choosingTill, setChoosingTill] = useState<CardReader | null>(null);

  const reload = async (askStripe: boolean) => {
    withStatus.current = askStripe;
    await list.refetch();
    void queryClient.invalidateQueries({ queryKey: queryKeys.pos.readers(accessToken) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.pos.bootstrap(accessToken) });
  };

  const readers = list.data?.readers ?? [];
  const canTakeCards = list.data?.can_take_cards === true;
  const testMode = list.data?.test_mode === true;
  const tillName = (id: string) => tills.find((t) => t.id === id)?.name ?? '';

  const update = async (reader: CardReader, body: { label?: string; till_id?: string | null }) => {
    setBusyId(reader.id);
    setError(null);
    try {
      await send(settingsMorePaths.reader(reader.id), 'PATCH', body);
    } catch (e) {
      setError(settingsErrorMessage(e, smT('common.networkError')));
    }
    setBusyId(null);
    await reload(false);
  };

  const remove = async (reader: CardReader) => {
    setRemoving(null);
    setBusyId(reader.id);
    setError(null);
    try {
      await send(settingsMorePaths.reader(reader.id), 'DELETE');
    } catch (e) {
      setError(
        settingsErrorCode(e) === 'POS_PAYMENT_IN_PROGRESS'
          ? readersT('set.readers.remove.busy', { reader: reader.label })
          : settingsErrorMessage(e, smT('common.networkError')),
      );
    }
    setBusyId(null);
    await reload(false);
  };

  const testCard = async (reader: CardReader) => {
    setBusyId(reader.id);
    setError(null);
    setNotice(null);
    try {
      await send(settingsMorePaths.readerTestCard(reader.id), 'POST', {});
      setNotice(readersT('set.readers.testCard.done', { reader: reader.label }));
    } catch (e) {
      setError(settingsErrorMessage(e, smT('common.networkError')));
    }
    setBusyId(null);
  };

  return (
    <SettingsScroll refreshing={list.isRefetching} onRefresh={() => void reload(true)}>
      <SettingsCard title={readersT('set.readers.title')} description={readersT('set.readers.branding')}>
        {canTakeCards ? (
          <View style={settingsStyles.stack}>
            <Button label={readersT('set.readers.add')} onPress={() => setAdding({ code: '' })} fullWidth />
            {testMode ? (
              <Button
                label={readersT('set.readers.simulated')}
                variant="secondary"
                onPress={() => setAdding({ code: 'simulated-s700' })}
                fullWidth
              />
            ) : null}
          </View>
        ) : null}

        {error ? (
          <MessageBox tone="danger" role="alert">
            {error}
          </MessageBox>
        ) : null}
        {list.isError && !error ? (
          <MessageBox tone="danger" role="alert">
            {settingsErrorMessage(list.error, smT('common.networkError'))}
          </MessageBox>
        ) : null}
        {notice ? (
          <MessageBox tone="success" role="status">
            {notice}
          </MessageBox>
        ) : null}

        {list.isLoading ? (
          <Text variant="bodySmall" tone="muted">
            {readersT('common.loading')}
          </Text>
        ) : null}
        {list.data && !canTakeCards ? <Text variant="bodySmall">{readersT('set.readers.needStripe')}</Text> : null}
        {list.data && canTakeCards && list.data.in_person_payments_enabled === false ? (
          <MessageBox tone="warning" role="note">
            {readersT('set.readers.inPersonOff')}
          </MessageBox>
        ) : null}
        {list.data && canTakeCards && readers.length === 0 ? (
          <Text variant="bodySmall" tone="secondary">
            {readersT('set.readers.empty')}
          </Text>
        ) : null}

        {readers.map((reader) => {
          const busy = busyId === reader.id;
          const extraTills = (reader.default_for_till_ids ?? []).filter((id) => id !== reader.till_id).map(tillName).filter(Boolean);
          const details = [
            readerModelLabel(reader.model),
            reader.serial_last4 ?? null,
            reader.is_active && reader.last_seen_at
              ? readersT('set.readers.lastSeen', { relative: lastSeenText(reader.last_seen_at) })
              : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <View key={reader.id} style={styles.reader} testID={`reader-${reader.id}`}>
              <View style={settingsStyles.wrap}>
                <Text variant="bodyMedium">{reader.label}</Text>
                <StatusBadge reader={reader} />
              </View>
              <Text variant="caption" tone="muted">
                {details}
              </Text>
              {!reader.is_active ? (
                <Text variant="caption" tone="secondary">
                  {readersT('set.readers.moved', { date: movedDate(reader.inactive_at) })}
                </Text>
              ) : null}
              {reader.model === 'wisepos' ? (
                <Text variant="caption" tone="muted">
                  {readersT('set.readers.wisepos.note')}
                </Text>
              ) : null}
              {reader.is_active ? (
                <FieldBlock label={readersT('set.readers.till')}>
                  <PickRow
                    title={reader.till_id ? tillName(reader.till_id) || readersT('set.readers.till.none') : readersT('set.readers.till.none')}
                    detail={extraTills.length > 0 ? extraTills.join(', ') : null}
                    disabled={busy}
                    onPress={() => setChoosingTill(reader)}
                  />
                </FieldBlock>
              ) : null}
              <View style={settingsStyles.wrap}>
                {reader.is_active && reader.model === 'simulated' && testMode ? (
                  <Button label={readersT('set.readers.testCard')} variant="ghost" size="sm" disabled={busy} onPress={() => void testCard(reader)} />
                ) : null}
                {reader.is_active ? (
                  <Button label={readersT('set.readers.rename')} variant="secondary" size="sm" disabled={busy} onPress={() => setRenaming(reader)} />
                ) : null}
                <Button
                  label={readersT('set.readers.remove')}
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  loading={busy}
                  onPress={() => (reader.is_active ? setRemoving(reader) : void remove(reader))}
                />
              </View>
            </View>
          );
        })}

        <View style={styles.notes}>
          <Text variant="bodySmall" tone="secondary">
            {readersT('set.readers.ownReader')}
          </Text>
          <Text variant="bodySmall" tone="secondary">
            {readersT('set.readers.getOne')}
          </Text>
        </View>
        {list.data && readers.some((r) => r.is_active) ? (
          <Button label={readersT('set.readers.refresh')} variant="ghost" size="sm" onPress={() => void reload(true)} />
        ) : null}
      </SettingsCard>

      <AddReaderSheet
        visible={adding !== null}
        prefill={adding?.code ?? ''}
        tills={tills}
        onClose={() => setAdding(null)}
        onAdded={async (name, moved) => {
          setAdding(null);
          setError(null);
          setNotice(
            [readersT('set.readers.added', { reader: name }), moved ? readersT('set.readers.movedHere', { venue: venueName }) : '']
              .filter(Boolean)
              .join(' '),
          );
          await reload(false);
        }}
      />
      <RenameSheet
        reader={renaming}
        onClose={() => setRenaming(null)}
        onSave={(reader, label) => {
          setRenaming(null);
          if (label && label !== reader.label) void update(reader, { label });
        }}
      />
      <PosSheet
        visible={choosingTill !== null}
        onClose={() => setChoosingTill(null)}
        title={readersT('set.readers.till')}
        subtitle={choosingTill?.label ?? null}>
        <PickRow
          title={readersT('set.readers.till.none')}
          selected={!choosingTill?.till_id}
          onPress={() => {
            const reader = choosingTill;
            setChoosingTill(null);
            if (reader && reader.till_id) void update(reader, { till_id: null });
          }}
        />
        {tills.map((t) => (
          <PickRow
            key={t.id}
            title={t.name}
            selected={choosingTill?.till_id === t.id}
            onPress={() => {
              const reader = choosingTill;
              setChoosingTill(null);
              if (reader && reader.till_id !== t.id) void update(reader, { till_id: t.id });
            }}
          />
        ))}
      </PosSheet>
      <ConfirmSheet
        visible={removing !== null}
        title={readersT('set.readers.remove.title', { reader: removing?.label ?? '' })}
        message={readersT('set.readers.remove.body')}
        confirmLabel={readersT('set.readers.remove')}
        cancelLabel={readersT('common.cancel')}
        destructive
        onConfirm={() => {
          if (removing) void remove(removing);
        }}
        onClose={() => setRemoving(null)}
      />
    </SettingsScroll>
  );
}

function AddReaderSheet({
  visible,
  prefill,
  tills,
  onClose,
  onAdded,
}: {
  visible: boolean;
  prefill: string;
  tills: TillOption[];
  onClose: () => void;
  onAdded: (name: string, moved: boolean) => void;
}) {
  const send = useSettingsSend();
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [tillId, setTillId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  // Each opening starts afresh, with the pairing code filled for a test reader and the only till chosen.
  const openKey = visible ? `open:${prefill}` : null;
  if (openKey !== openedFor) {
    setOpenedFor(openKey);
    if (visible) {
      setCode(prefill);
      setLabel('');
      setTillId(tills.length === 1 ? tills[0]!.id : '');
      setError(null);
    }
  }

  const add = async () => {
    if (!code.trim() || !label.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await send<{ reader: CardReader | null; moved: boolean }>(settingsMorePaths.readersCreate, 'POST', {
        registration_code: code.trim(),
        label: label.trim(),
        till_id: tillId || null,
      });
      setSaving(false);
      onAdded(res.reader?.label ?? label.trim(), res.moved === true);
    } catch (e) {
      setSaving(false);
      setError(settingsErrorMessage(e, smT('common.networkError')));
    }
  };

  return (
    <PosSheet
      visible={visible}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={readersT('set.readers.add.title')}
      footer={
        <View style={settingsStyles.stack}>
          <Button
            label={readersT('set.readers.add.confirm')}
            onPress={() => void add()}
            loading={saving}
            disabled={!code.trim() || !label.trim()}
            fullWidth
          />
          <Button label={readersT('common.cancel')} variant="ghost" onPress={onClose} disabled={saving} fullWidth />
        </View>
      }>
      <View style={styles.steps}>
        <Text variant="bodySmall">1. {readersT('set.readers.step1')}</Text>
        <Text variant="bodySmall">2. {readersT('set.readers.step2')}</Text>
        <Text variant="bodySmall">3. {readersT('set.readers.step3')}</Text>
      </View>
      <Text variant="caption" tone="muted">
        {readersT('set.readers.ownReader')}
      </Text>
      <Input
        label={readersT('set.readers.code')}
        accessibilityLabel={readersT('set.readers.code')}
        value={code}
        onChangeText={setCode}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
      />
      <Input
        label={readersT('set.readers.name')}
        accessibilityLabel={readersT('set.readers.name')}
        value={label}
        onChangeText={setLabel}
        maxLength={60}
        placeholder={readersT('set.readers.name.placeholder')}
      />
      {tills.length > 0 ? (
        <FieldBlock label={readersT('set.readers.till')}>
          <PickRow title={readersT('set.readers.till.none')} selected={tillId === ''} onPress={() => setTillId('')} />
          {tills.map((t) => (
            <PickRow key={t.id} title={t.name} selected={tillId === t.id} onPress={() => setTillId(t.id)} />
          ))}
        </FieldBlock>
      ) : null}
      {error ? (
        <MessageBox tone="danger" role="alert">
          {error}
        </MessageBox>
      ) : null}
    </PosSheet>
  );
}

function RenameSheet({
  reader,
  onClose,
  onSave,
}: {
  reader: CardReader | null;
  onClose: () => void;
  onSave: (reader: CardReader, label: string) => void;
}) {
  const [name, setName] = useState('');
  const [seenId, setSeenId] = useState<string | null>(null);
  if ((reader?.id ?? null) !== seenId) {
    setSeenId(reader?.id ?? null);
    setName(reader?.label ?? '');
  }
  return (
    <PosSheet
      visible={reader !== null}
      onClose={onClose}
      title={readersT('set.readers.rename')}
      footer={
        <View style={settingsStyles.stack}>
          <Button
            label={readersT('set.readers.saveName')}
            disabled={!name.trim()}
            onPress={() => {
              if (reader) onSave(reader, name.trim());
            }}
            fullWidth
          />
          <Button label={readersT('common.cancel')} variant="ghost" onPress={onClose} fullWidth />
        </View>
      }>
      <Input label={readersT('set.readers.name')} accessibilityLabel={readersT('set.readers.name')} value={name} onChangeText={setName} maxLength={60} autoFocus />
    </PosSheet>
  );
}

const styles = StyleSheet.create({
  reader: { gap: spacing.xs, paddingVertical: spacing.sm },
  notes: { gap: spacing.xs },
  steps: { gap: spacing.xs },
});
