import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceCard, ChoiceGroup, SetupSection } from '@/components/pos/setup/parts';
import { SetupButtons, SetupFrame, type SetupData } from '@/components/pos/setup/SetupFrame';
import { useStepRunner } from '@/components/pos/setup/useStepRunner';
import { Input } from '@/components/ui/Input';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { commissionBodies, rateFromText, teamPresetFrom, teamSettingsFor, type TeamPreset } from '@/lib/pos/setup/answers';
import { setupT } from '@/lib/pos/setup/copy';
import { settingsErrorMessage, settingsMorePaths } from '@/lib/pos/settings-more/api';
import { useSettingsSend } from '@/lib/pos/settings-more/hooks';
import type { CommissionRatesResponse } from '@/lib/pos/settings-more/types';
import { useSaveCheckoutSettings } from '@/lib/queries/useCheckoutSettings';
import { usePosBootstrap } from '@/lib/queries/usePos';
import { useStaffList } from '@/lib/queries/useStaffList';
import { spacing } from '@/theme/index';

/**
 * W6, "Your team at the till" (design 6.3, drawn as B7): only for a team (the status says so). The
 * permissions question shows when there are team logins besides the admins, the commission question
 * with two or more calendars. "Staff" (formerly "Team member") or "Front desk" saves that preset's
 * whole map to the Staff map (`staff_capabilities`, roles plan §5.13: Front desk people have their
 * own map, set in Checkout settings); the discount limit goes with it. Commission adds one rate for
 * services and one for products, from today (`POST /api/venue/pos/commission/rates`); gift vouchers
 * earn nothing when sold.
 */
export function TeamStep({ data }: { data: SetupData }) {
  const runner = useStepRunner('team', data);
  const saveSettings = useSaveCheckoutSettings();
  const send = useSettingsSend();
  const staff = useStaffList(true);
  const boot = usePosBootstrap();
  const settings = data.settings.settings;
  const stored = data.settings.staff_capability_map;
  const defaults = data.settings.capability_defaults;
  const [preset, setPreset] = useState<TeamPreset | null>(() => teamPresetFrom(data.status.answers, stored, defaults));
  const [limit, setLimit] = useState<number>(settings.staff_max_discount_percent);
  const [commission, setCommission] = useState<boolean | null>(data.status.answers.team?.commission ?? null);
  const [servicesText, setServicesText] = useState('');
  const [productsText, setProductsText] = useState('');

  // Until the team list answers, ask: a venue that sees this screen has a team.
  const teamLogins = staff.data ? staff.data.staff.some((s) => s.role !== 'admin') : true;
  const calendars = (boot.data?.operators ?? []).filter((o) => o.calendar_id).length;
  const askCommission = calendars >= 2;

  const onContinue = () => {
    const services = commission ? rateFromText(servicesText) : null;
    const products = commission ? rateFromText(productsText) : null;
    if ((services !== null && Number.isNaN(services)) || (products !== null && Number.isNaN(products))) {
      runner.setError(setupT('setup.team.commission.invalid'));
      return;
    }
    void runner.proceed(async () => {
      const partial = teamSettingsFor({
        preset: teamLogins ? preset : null,
        limit,
        stored,
        defaults,
        currentLimit: settings.staff_max_discount_percent,
      });
      if (Object.keys(partial).length > 0) {
        const saved = await saveSettings(partial);
        if (!saved.ok) return saved.message;
      }
      if (askCommission && commission && (services !== null || products !== null)) {
        try {
          const rates = await send<CommissionRatesResponse>(settingsMorePaths.commissionRates, 'GET');
          for (const body of commissionBodies({ services, products }, rates.today)) {
            await send<CommissionRatesResponse>(settingsMorePaths.commissionRates, 'POST', body);
          }
        } catch (e) {
          return settingsErrorMessage(e);
        }
      }
      return null;
    }, { team: { preset: teamLogins ? preset : null, commission: askCommission ? commission : null } });
  };

  const busy = runner.busy !== null;

  return (
    <SetupFrame
      screen="team"
      data={data}
      title={setupT('setup.team.title')}
      intro={teamLogins ? setupT('setup.team.help') : null}
      footer={<SetupButtons onContinue={onContinue} onSkip={() => void runner.skip()} busy={runner.busy} error={runner.error} />}>
      {teamLogins ? (
        <ChoiceGroup>
          <ChoiceCard
            title={setupT('setup.team.team')}
            note={setupT('setup.team.team.note')}
            selected={preset === 'team_member'}
            onPress={() => setPreset('team_member')}
            disabled={busy}
          />
          <ChoiceCard
            title={setupT('setup.team.frontDesk')}
            note={setupT('setup.team.frontDesk.note')}
            selected={preset === 'front_desk'}
            onPress={() => setPreset('front_desk')}
            disabled={busy}
          />
        </ChoiceGroup>
      ) : null}

      <Stepper
        label={setupT('setup.team.limit', { limit })}
        value={`${limit}%`}
        onDecrement={() => setLimit((n) => Math.max(0, n - 1))}
        onIncrement={() => setLimit((n) => Math.min(100, n + 1))}
      />

      {askCommission ? (
        <View style={styles.stack}>
          <ChoiceGroup label={setupT('setup.team.commission.title')}>
            <View style={styles.row}>
              <View style={styles.half}>
                <ChoiceCard title={setupT('setup.team.commission.no')} selected={commission === false} onPress={() => setCommission(false)} disabled={busy} />
              </View>
              <View style={styles.half}>
                <ChoiceCard title={setupT('setup.team.commission.yes')} selected={commission === true} onPress={() => setCommission(true)} disabled={busy} />
              </View>
            </View>
          </ChoiceGroup>
          {commission ? (
            <SetupSection>
              <View style={styles.row}>
                <View style={styles.half}>
                  <Input
                    label={setupT('setup.team.commission.services')}
                    value={servicesText}
                    onChangeText={(text) => {
                      setServicesText(text);
                      runner.setError(null);
                    }}
                    keyboardType="decimal-pad"
                    editable={!busy}
                    rightSlot={<Text variant="body" tone="muted">%</Text>}
                  />
                </View>
                <View style={styles.half}>
                  <Input
                    label={setupT('setup.team.commission.products')}
                    value={productsText}
                    onChangeText={(text) => {
                      setProductsText(text);
                      runner.setError(null);
                    }}
                    keyboardType="decimal-pad"
                    editable={!busy}
                    rightSlot={<Text variant="body" tone="muted">%</Text>}
                  />
                </View>
              </View>
              <Text variant="caption" tone="muted">
                {setupT('setup.team.commission.note')}
              </Text>
            </SetupSection>
          ) : null}
        </View>
      ) : null}
    </SetupFrame>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
});
