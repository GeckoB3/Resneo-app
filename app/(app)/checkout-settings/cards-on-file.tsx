import { useState } from 'react';

import { MessageBox, SettingsCard, SettingsScreen, SettingsScroll, SwitchRow } from '@/components/pos/settings-more/parts';
import { Text } from '@/components/ui/Text';
import { cardsOnFileT } from '@/lib/pos/settings-more/cards-copy';
import { useClientWords } from '@/lib/pos/settings-more/copy';
import { usePosSettings, usePosSettingsSave } from '@/lib/pos/settings-more/hooks';
import type { PosSettingsResponse } from '@/lib/pos/settings-more/types';

/**
 * Settings, Checkout: Cards on file in the app (web `CardsOnFileCard`, UX spec §9.10; plan §4.4.5,
 * PQ27, D18). Off by default. A card is only ever saved when the client agrees on the card reader
 * or on the phone handed to them; staff can never agree for them. The switch saves at once, at the
 * loaded settings version; changing it needs `manage_settings` (admins always), as on the web.
 */
export default function CardsOnFileScreen() {
  return (
    <SettingsScreen title={cardsOnFileT('set.cof.title')}>{(data) => <CardsOnFileBody data={data} />}</SettingsScreen>
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
