import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import {
  POS_MESSAGES_COPY,
  SHOP_MESSAGE_SWITCHES,
  visiblePosMessageSwitches,
  type PosMessageFeatures,
  type ShopMessageSwitchKey,
} from '@/lib/communications/pos-message-switches';
import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { errorBody, isStaleWrite, settingsErrorMessage, settingsMorePaths } from '@/lib/pos/settings-more/api';
import { settingsMoreKeys, useSettingsQuery, useSettingsSend } from '@/lib/pos/settings-more/hooks';
import type { ShopAdminView } from '@/lib/pos/settings-more/types';
import { usePosGate } from '@/lib/queries/usePos';
import { minTouchTarget, spacing } from '@/theme/index';
import type { PosMessageSwitchKey, PosMessageSwitches } from '@/types/communications';

/**
 * Checkout and online shop messages on the Communications screen (web `PosMessageSwitchesBlock`,
 * plan §4.23). The screen renders this only while Checkout is on.
 *
 * The Checkout switches are part of the screen's draft and save with the rest of it (the
 * `pos` block of the communication policies PUT). The shop's two optional messages are the shop's
 * own settings: as on the web, a toggle saves at once to /api/venue/shop/settings at the loaded
 * version, a 412 loads the fresh settings and says so, and the shop screen sees the same cache.
 */
export function PosMessageSwitchesCard({
  features,
  switches,
  isAdmin,
  onToggle,
}: {
  features: PosMessageFeatures;
  switches: PosMessageSwitches | null;
  isAdmin: boolean;
  onToggle: (key: PosMessageSwitchKey, enabled: boolean) => void;
}) {
  const shown = visiblePosMessageSwitches(features);
  if (!features.pos) return null;
  return (
    <>
      <Card>
        <Text variant="label">{POS_MESSAGES_COPY.title}</Text>
        <Text variant="caption" tone="muted" style={styles.sectionSub}>
          {POS_MESSAGES_COPY.intro}
        </Text>
        <View style={styles.section}>
          {shown.map((s) => (
            <SwitchRow
              key={s.key}
              label={s.label}
              description={s.description}
              value={switches?.[s.key]?.enabled !== false}
              disabled={!isAdmin}
              onChange={(next) => onToggle(s.key, next)}
            />
          ))}
        </View>
      </Card>
      {features.shop ? <ShopMessagesCard isAdmin={isAdmin} /> : null}
    </>
  );
}

function ShopMessagesCard({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const { accessToken } = usePosGate();
  const send = useSettingsSend();
  // The shop's settings are admin-only on the server; the web loads them only for admins too.
  const query = useSettingsQuery<ShopAdminView>(settingsMoreKeys.shop, settingsMorePaths.shopSettings, {
    enabled: isAdmin,
  });
  const [pending, setPending] = useState<Partial<Record<ShopMessageSwitchKey, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const settings = query.data?.settings ?? null;
  const loadError = query.isError ? settingsErrorMessage(query.error) : null;
  const shopKey = settingsMoreKeys.shop(accessToken);

  const toggle = async (key: ShopMessageSwitchKey, value: boolean) => {
    if (!settings || busy) return;
    hapticSelect();
    setBusy(true);
    setPending({ [key]: value });
    try {
      const fresh = await send<ShopAdminView>(settingsMorePaths.shopSettings, 'PATCH', {
        version: settings.version,
        [key]: value,
      });
      queryClient.setQueryData(shopKey, fresh);
      // The shop settings share the POS settings version: the other settings screens read it again.
      void queryClient.invalidateQueries({ queryKey: settingsMoreKeys.settings(accessToken) });
      setError(null);
      hapticSuccess();
    } catch (e) {
      hapticWarning();
      if (isStaleWrite(e)) {
        setError(POS_MESSAGES_COPY.shopStale);
        const b = errorBody<Partial<ShopAdminView> & { error?: unknown; code?: unknown }>(e);
        if (b?.settings && b.readiness) {
          const { error: _error, code: _code, ...rest } = b;
          queryClient.setQueryData(shopKey, rest as ShopAdminView);
        } else {
          await query.refetch();
        }
        void queryClient.invalidateQueries({ queryKey: settingsMoreKeys.settings(accessToken) });
      } else {
        setError(settingsErrorMessage(e));
        await query.refetch();
      }
    } finally {
      setPending({});
      setBusy(false);
    }
  };

  const shownError = error ?? loadError;

  return (
    <Card>
      <Text variant="label">{POS_MESSAGES_COPY.shopTitle}</Text>
      <Text variant="caption" tone="muted" style={styles.sectionSub}>
        {POS_MESSAGES_COPY.shopIntro}
      </Text>
      {shownError ? (
        <Text variant="bodySmall" tone="danger" accessibilityRole="alert" style={styles.error}>
          {shownError}
        </Text>
      ) : null}
      <View style={styles.section}>
        {SHOP_MESSAGE_SWITCHES.map((s) => (
          <SwitchRow
            key={s.key}
            label={s.label}
            description={s.description}
            value={pending[s.key] ?? (settings ? settings[s.key] === true : false)}
            disabled={!isAdmin || !settings || busy}
            onChange={(next) => void toggle(s.key, next)}
          />
        ))}
      </View>
    </Card>
  );
}

function SwitchRow({
  label,
  description,
  value,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text variant="bodyMedium">{label}</Text>
        <Text variant="caption" tone="muted">
          {description}
        </Text>
      </View>
      <Switch value={value} disabled={disabled} accessibilityLabel={label} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionSub: {
    marginTop: 2,
  },
  section: {
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.base,
    minHeight: minTouchTarget,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  error: {
    marginTop: spacing.sm,
  },
});
