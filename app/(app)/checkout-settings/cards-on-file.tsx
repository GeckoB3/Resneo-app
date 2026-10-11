import { useState } from 'react';

import { MessageBox, OptionList, SettingsCard, SettingsScreen, SettingsScroll, SwitchRow } from '@/components/pos/settings-more/parts';
import { Text } from '@/components/ui/Text';
import { cardsOnFileT } from '@/lib/pos/settings-more/cards-copy';
import { useClientWords } from '@/lib/pos/settings-more/copy';
import { usePosSettings, usePosSettingsSave } from '@/lib/pos/settings-more/hooks';
import type { PosSettingsResponse } from '@/lib/pos/settings-more/types';

/** `set.links.hours.options`: how long a pay link works, in hours. */
const LINK_HOURS: { hours: number; label: string }[] = [
  { hours: 1, label: '1 hour' },
  { hours: 4, label: '4 hours' },
  { hours: 12, label: '12 hours' },
  { hours: 24, label: '24 hours' },
  { hours: 48, label: '2 days' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '1 week' },
  { hours: 720, label: '30 days' },
];

/**
 * Settings, Checkout: Pay links and saved cards in the app (web `CardsOnFileCard`, UX spec §9.10;
 * plan §4.4.4, §4.4.5, PQ27, D18). "Pay links work for" sets how long a new link stays open (24
 * hours unless changed). Cards on file is off by default. A card is only ever saved when the client agrees on the card reader
 * or on the phone handed to them; staff can never agree for them. The switch saves at once, at the
 * loaded settings version; changing it needs `manage_settings` (admins always), as on the web.
 */
export default function CardsOnFileScreen() {
  return (
    <SettingsScreen title={cardsOnFileT('set.links.title')}>{(data) => <CardsOnFileBody data={data} />}</SettingsScreen>
  );
}

function CardsOnFileBody({ data }: { data: PosSettingsResponse }) {
  const words = useClientWords();
  const save = usePosSettingsSave();
  const query = usePosSettings();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error' | 'stale'; text: string } | null>(null);
  const canEdit = data.can.is_admin || data.can.manage_settings;
  const on = data.settings.card_on_file_enabled === true;
  const hours = data.settings.pay_link_hours ?? 24;

  const setHours = async (next: number) => {
    setBusy(true);
    setMessage(null);
    const time = LINK_HOURS.find((o) => o.hours === next)?.label ?? `${next} hours`;
    const r = await save({ pay_link_hours: next });
    setBusy(false);
    setMessage(
      r.ok ? { kind: 'ok', text: cardsOnFileT('set.links.hours.saved', { time }) } : { kind: r.stale ? 'stale' : 'error', text: r.message },
    );
  };

  const set = async (next: boolean) => {
    setBusy(true);
    setMessage(null);
    const done = next ? cardsOnFileT('set.cof.on') : cardsOnFileT('set.cof.off');
    const r = await save({ card_on_file_enabled: next });
    setBusy(false);
    setMessage(r.ok ? { kind: 'ok', text: done } : { kind: r.stale ? 'stale' : 'error', text: r.message });
  };

  return (
    <SettingsScroll refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <SettingsCard title={cardsOnFileT('set.links.hours')} description={cardsOnFileT('set.links.hours.help')}>
        <OptionList<string>
          label={cardsOnFileT('set.links.hours')}
          value={String(hours)}
          disabled={!canEdit || busy}
          options={LINK_HOURS.map((o) => ({ value: String(o.hours), label: o.label }))}
          onChange={(v) => void setHours(Number(v))}
        />
      </SettingsCard>
      <SettingsCard
        title={cardsOnFileT('set.cof.title')}
        description={cardsOnFileT('set.cof.help', { client: words.client })}>
        <SwitchRow
          label={cardsOnFileT('set.cof.switch', { clients: words.clients })}
          help={cardsOnFileT('set.cof.switch.help')}
          value={on}
          disabled={!canEdit || busy}
          onChange={(v) => void set(v)}
        />
        {message ? (
          <MessageBox
            tone={message.kind === 'ok' ? 'success' : message.kind === 'stale' ? 'warning' : 'danger'}
            role={message.kind === 'ok' ? 'status' : 'alert'}>
            {message.text}
          </MessageBox>
        ) : null}
        {!canEdit ? (
          <Text variant="caption" tone="muted">
            {cardsOnFileT('set.cof.readOnly')}
          </Text>
        ) : null}
      </SettingsCard>
    </SettingsScroll>
  );
}
