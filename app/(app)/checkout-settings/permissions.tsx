import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Banner,
  CheckoutSettingsShell,
  SwitchRow,
  useCheckoutSettingsCtx,
  useUnsavedGuard,
} from '@/components/pos/settings/SettingsParts';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { SectionCard } from '@/components/ui/SectionCard';
import { Text } from '@/components/ui/Text';
import {
  capabilityGroups,
  capabilityMapChanged,
  matchingPreset,
  presetMap,
  type PresetId,
} from '@/lib/pos/settings-capabilities';
import { SETTINGS_COPY } from '@/lib/pos/settings-copy';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosSettingsCapabilityMap } from '@/types/pos-settings';

/**
 * Team permissions (web `PermissionsCard.tsx`, UX spec §9.7, plan §4.19), admins only: the three
 * preset cards first (Owner and admins is fixed), then the full map under Advanced, closed until
 * opened. Choosing a preset asks first and saves the whole map; the full map saves with its own
 * button. Both send only `staff_capabilities` at the loaded version.
 */

export default function PermissionsSettingsScreen() {
  return (
    <CheckoutSettingsShell title={SETTINGS_COPY['set.caps.presets.title']} adminOnly>
      <PermissionsSection />
    </CheckoutSettingsShell>
  );
}

function PermissionsSection() {
  const { data, t, words, save } = useCheckoutSettingsCtx();
  const { colors } = useTheme();
  const toast = useToast();
  const defaults = data.capability_defaults;
  const stored = data.staff_capability_map;
  const [draft, setDraft] = useState<PosSettingsCapabilityMap | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ text: string; stale: boolean } | null>(null);
  const [asking, setAsking] = useState<PresetId | 'reset' | null>(null);
  const groups = useMemo(() => capabilityGroups(words), [words]);
  const map = draft ?? stored;
  const dirty = draft !== null && capabilityMapChanged(draft, stored);
  const guard = useUnsavedGuard(dirty);
  const current = matchingPreset(stored, defaults);
  const presetName = (id: PresetId) => (id === 'team' ? t('set.caps.preset.team') : t('set.caps.preset.frontDesk'));

  const saveMap = async (next: PosSettingsCapabilityMap, message: string) => {
    setSaving(true);
    setError(null);
    const r = await save({ staff_capabilities: next });
    setSaving(false);
    if (r.ok) {
      setDraft(null);
      toast.success(message);
    } else setError({ text: r.message, stale: r.stale });
  };

  const confirm = async () => {
    const what = asking;
    setAsking(null);
    if (what === 'reset') await saveMap({ ...defaults }, t('set.caps.reset.saved'));
    else if (what) await saveMap(presetMap(what, defaults), t('set.caps.preset.saved', { preset: presetName(what) }));
  };

  const cards: { id: PresetId | 'owner'; title: string; body: string }[] = [
    { id: 'owner', title: t('set.caps.preset.owner'), body: t('set.caps.preset.owner.body') },
    { id: 'frontDesk', title: t('set.caps.preset.frontDesk'), body: t('set.caps.preset.frontDesk.body') },
    { id: 'team', title: t('set.caps.preset.team'), body: t('set.caps.preset.team.body') },
  ];

  return (
    <>
      <SectionCard>
        <SectionCard.Header title={t('set.caps.presets.title')} description={t('set.caps.presets.help')} />
        <SectionCard.Body style={styles.body}>
          {error ? <Banner tone={error.stale ? 'warning' : 'danger'}>{error.text}</Banner> : null}
          <View accessibilityRole="radiogroup" accessibilityLabel={t('set.caps.presets.title')} style={styles.cards}>
            {cards.map((card) => {
              const isOwner = card.id === 'owner';
              const selected = !isOwner && current === card.id;
              return (
                <Pressable
                  key={card.id}
                  accessibilityRole="radio"
                  accessibilityLabel={card.title}
                  accessibilityState={{ checked: selected, disabled: isOwner || saving }}
                  disabled={isOwner || saving}
                  onPress={() => {
                    if (!isOwner && current !== card.id) setAsking(card.id as PresetId);
                  }}
                  style={[
                    styles.card,
                    {
                      borderColor: selected ? colors.brand : colors.border,
                      backgroundColor: selected ? colors.brandSubtle : isOwner ? colors.surface : colors.surfaceRaised,
                    },
                  ]}>
                  <View style={styles.cardTitle}>
                    {!isOwner ? (
                      <View style={[styles.radio, { borderColor: selected ? colors.brand : colors.borderStrong, borderWidth: selected ? 6 : 2 }]} />
                    ) : null}
                    <Text variant="label">{card.title}</Text>
                  </View>
                  <Text variant="caption" tone="secondary">
                    {card.body}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {current === null ? (
            <Text variant="bodySmall" tone="secondary">
              {t('set.caps.preset.custom')}
            </Text>
          ) : null}

          <Button
            label={t('set.caps.advanced')}
            variant="ghost"
            accessibilityState={{ expanded: advanced }}
            onPress={() => setAdvanced((a) => !a)}
          />

          {advanced ? (
            <View style={styles.advanced}>
              <Text variant="subheading">{t('set.caps.title')}</Text>
              <Text variant="bodySmall" tone="secondary">
                {t('set.caps.help')}
              </Text>
              <View style={[styles.note, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text variant="caption" tone="secondary">
                  {t('set.caps.sharedDevice')}
                </Text>
              </View>
              {groups.map((g) => (
                <View key={g.id} style={styles.group}>
                  <Text variant="label">{g.title}</Text>
                  {g.items.map((item) => (
                    <SwitchRow
                      key={item.key}
                      label={
                        item.key === 'apply_discount'
                          ? t('set.caps.upTo', { label: item.label, percent: String(data.settings.staff_max_discount_percent) })
                          : item.label
                      }
                      help={item.help}
                      value={Boolean(map[item.key])}
                      disabled={saving}
                      onChange={(v) => setDraft({ ...map, [item.key]: v })}
                    />
                  ))}
                  {g.note === 'alwaysAdmin' ? (
                    <Text variant="caption" tone="muted">
                      {t('set.caps.alwaysAdmin')}
                    </Text>
                  ) : null}
                </View>
              ))}
              <Button label={t('set.caps.reset')} variant="secondary" size="sm" disabled={saving} onPress={() => setAsking('reset')} />
            </View>
          ) : null}
        </SectionCard.Body>
        {advanced ? (
          <SectionCard.Footer style={styles.footer}>
            {dirty ? (
              <Button
                label={error?.stale ? t('common.useTheirs') : t('common.discard')}
                variant="ghost"
                disabled={saving}
                fullWidth
                onPress={() => {
                  setDraft(null);
                  setError(null);
                }}
              />
            ) : null}
            <Button
              label={t('common.save')}
              disabled={!dirty}
              loading={saving}
              fullWidth
              onPress={() => {
                if (draft) void saveMap(draft, t('set.caps.saved'));
              }}
            />
          </SectionCard.Footer>
        ) : null}
      </SectionCard>
      <ConfirmSheet
        visible={asking !== null}
        title={
          asking === 'reset'
            ? t('set.caps.reset.title')
            : asking
              ? t('set.caps.preset.confirm.title', { preset: presetName(asking) })
              : ''
        }
        message={asking === 'reset' ? t('set.caps.reset.body') : t('set.caps.preset.confirm.body')}
        confirmLabel={
          asking === 'reset' ? t('set.caps.reset') : asking ? t('set.caps.preset.confirm.label', { preset: presetName(asking) }) : ''
        }
        cancelLabel={t('common.cancel')}
        destructive={false}
        onConfirm={() => void confirm()}
        onClose={() => setAsking(null)}
      />
      {guard}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg },
  cards: { gap: spacing.sm },
  card: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  cardTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  radio: { width: 18, height: 18, borderRadius: 9 },
  advanced: { gap: spacing.md },
  note: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  group: { gap: spacing.sm },
  footer: { gap: spacing.sm },
});
