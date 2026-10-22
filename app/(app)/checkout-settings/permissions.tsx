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
  frontDeskPreset,
  teamPreset,
} from '@/lib/pos/settings-capabilities';
import { SETTINGS_COPY } from '@/lib/pos/settings-copy';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosSettingsCapabilityMap } from '@/types/pos-settings';

/**
 * Who can do what (web `PermissionsCard.tsx`, UX spec §9.7, plan §4.19; roles plan §5.13), admins
 * only. Till rights are one map per role, never per person: Staff have the Staff map (what every
 * team member had before Front desk existed) and Front desk have their own, which starts as the
 * Front desk preset. Choose a role to see what it can do; "Change what {role} can do" opens that
 * role's full map, which saves with its own button (`staff_capabilities` or
 * `front_desk_capabilities` at the loaded version). Going back to the standard set asks first;
 * for Front desk it saves null, so the map follows the preset if ResNeo ever changes it.
 *
 * A server before roles sends no Front desk map and does not know the key, so only Staff shows.
 */

type RoleTab = 'front_desk' | 'team';

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
  const hasFrontDesk = data.front_desk_capability_map !== undefined;
  const [chosen, setChosen] = useState<RoleTab>('team');
  const role: RoleTab = hasFrontDesk ? chosen : 'team';
  const storedFor = (r: RoleTab): PosSettingsCapabilityMap =>
    r === 'team' ? data.staff_capability_map : (data.front_desk_capability_map ?? frontDeskPreset(defaults));
  const standardFor = (r: RoleTab): PosSettingsCapabilityMap => (r === 'team' ? teamPreset(defaults) : frontDeskPreset(defaults));
  const roleName = (r: RoleTab) => (r === 'team' ? t('set.caps.preset.team') : t('set.caps.preset.frontDesk'));

  const stored = storedFor(role);
  const [draft, setDraft] = useState<PosSettingsCapabilityMap | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ text: string; stale: boolean } | null>(null);
  const [askingReset, setAskingReset] = useState(false);
  const groups = useMemo(() => capabilityGroups(words), [words]);
  const map = draft ?? stored;
  const dirty = draft !== null && capabilityMapChanged(draft, stored);
  const guard = useUnsavedGuard(dirty);
  const isStandard = !capabilityMapChanged(standardFor(role), stored);

  const saveMap = async (next: PosSettingsCapabilityMap | null, message: string) => {
    setSaving(true);
    setError(null);
    const r = await save(role === 'team' ? { staff_capabilities: next ?? {} } : { front_desk_capabilities: next });
    setSaving(false);
    if (r.ok) {
      setDraft(null);
      toast.success(message);
    } else setError({ text: r.message, stale: r.stale });
  };

  const chooseRole = (next: RoleTab) => {
    if (next === role) return;
    setChosen(next);
    setDraft(null);
    setError(null);
  };

  const confirmReset = async () => {
    setAskingReset(false);
    // Front desk goes back to null, so it follows the preset if ResNeo ever changes it.
    await saveMap(role === 'team' ? { ...defaults } : null, t('set.caps.reset.saved'));
  };

  const cards: { id: RoleTab | 'owner'; title: string; body: string }[] = [
    { id: 'owner', title: t('set.caps.preset.owner'), body: t('set.caps.preset.owner.body') },
    ...(hasFrontDesk
      ? [{ id: 'front_desk' as const, title: t('set.caps.preset.frontDesk'), body: t('set.caps.preset.frontDesk.body') }]
      : []),
    { id: 'team', title: t('set.caps.preset.team'), body: t('set.caps.preset.team.body') },
  ];

  return (
    <>
      <SectionCard>
        <SectionCard.Header title={t('set.caps.presets.title')} description={t('set.caps.presets.help')} />
        <SectionCard.Body style={styles.body}>
          {error ? <Banner tone={error.stale ? 'warning' : 'danger'}>{error.text}</Banner> : null}
          <View accessibilityRole="radiogroup" accessibilityLabel={t('set.caps.role.choose')} style={styles.cards}>
            {cards.map((card) => {
              const isOwner = card.id === 'owner';
              const selected = !isOwner && role === card.id;
              const disabled = isOwner || saving || dirty;
              return (
                <Pressable
                  key={card.id}
                  accessibilityRole="radio"
                  accessibilityLabel={card.title}
                  accessibilityState={{ checked: selected, disabled }}
                  disabled={disabled}
                  onPress={() => {
                    if (!isOwner) chooseRole(card.id as RoleTab);
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
          <Text variant="bodySmall" tone="secondary">
            {isStandard
              ? role === 'team'
                ? t('set.caps.role.standard.team')
                : t('set.caps.role.standard.frontDesk')
              : t('set.caps.preset.custom')}
          </Text>

          <Button
            label={t('set.caps.role.edit', { role: roleName(role) })}
            variant="ghost"
            accessibilityState={{ expanded: advanced }}
            onPress={() => setAdvanced((a) => !a)}
          />

          {advanced ? (
            <View style={styles.advanced}>
              <Text variant="subheading">{t('set.caps.title', { role: roleName(role) })}</Text>
              <Text variant="bodySmall" tone="secondary">
                {t('set.caps.help', { role: roleName(role) })}
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
              <Button
                label={role === 'team' ? t('set.caps.reset') : t('set.caps.reset.frontDesk')}
                variant="secondary"
                size="sm"
                disabled={saving || isStandard}
                onPress={() => setAskingReset(true)}
              />
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
                if (draft) void saveMap(draft, t('set.caps.saved', { role: roleName(role) }));
              }}
            />
          </SectionCard.Footer>
        ) : null}
      </SectionCard>
      <ConfirmSheet
        visible={askingReset}
        title={t('set.caps.reset.title')}
        message={role === 'team' ? t('set.caps.reset.body') : t('set.caps.reset.frontDesk.body')}
        confirmLabel={role === 'team' ? t('set.caps.reset') : t('set.caps.reset.frontDesk')}
        cancelLabel={t('common.cancel')}
        destructive={false}
        onConfirm={() => void confirmReset()}
        onClose={() => setAskingReset(false)}
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
