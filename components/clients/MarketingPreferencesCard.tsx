import { format, parseISO } from 'date-fns';
import { StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { Text } from '@/components/ui/Text';
import { hasMarketingPermission, marketingPermissionSummary } from '@/lib/guests/marketing-permission';
import { spacing } from '@/theme/index';

type MarketingPreferencesCardProps = {
  marketingConsent: boolean;
  marketingOptOut: boolean;
  marketingConsentAt: string | null;
  onConsentChange: (value: boolean) => void;
  onOptOutChange: (value: boolean) => void;
  disabled?: boolean;
  /** Render inside a tap-to-expand CollapsibleCard instead of a plain Card. */
  collapsible?: boolean;
  /** One-line summary shown on the collapsed header (collapsible mode only). */
  summary?: string | null;
  defaultExpanded?: boolean;
};

function formatConsentDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return format(parseISO(iso), 'd MMM yyyy, HH:mm');
  } catch {
    return iso;
  }
}

/**
 * Dedicated card showing marketing opt-in and opt-out independently,
 * mirroring the web's ContactMarketingSection two-toggle layout.
 */
export function MarketingPreferencesCard({
  marketingConsent,
  marketingOptOut,
  marketingConsentAt,
  onConsentChange,
  onOptOutChange,
  disabled = false,
  collapsible = false,
  summary = null,
  defaultExpanded = false,
}: MarketingPreferencesCardProps) {
  const consentDate = formatConsentDate(marketingConsentAt);

  const permitted = hasMarketingPermission({
    marketing_consent: marketingConsent,
    marketing_opt_out: marketingOptOut,
  });

  // The two flags are one preference seen from two sides (web 2026-09-10):
  // recording a fresh consent lifts a standing opt-out, and opting out
  // withdraws the consent, so the pair can never say both at once.
  const body = (
    <>
      <Text variant="caption" tone="muted">
        Booking messages (confirmations, reminders) and one-to-one messages you send from this
        screen are always delivered. Messages sent to several contacts at once from the contacts
        list only go to contacts with marketing consent who have not opted out.
      </Text>

      <View style={[styles.row, styles.rowSeparated]}>
        <View style={styles.labelBlock}>
          <Text variant="bodySmall">Opted out of marketing</Text>
          <Text variant="caption" tone="muted">
            Contact has asked not to receive marketing
          </Text>
        </View>
        <Switch value={marketingOptOut} onValueChange={onOptOutChange} disabled={disabled} />
      </View>

      <View style={[styles.row, styles.rowSeparated]}>
        <View style={styles.labelBlock}>
          <Text variant="bodySmall">Marketing consent given</Text>
          <Text variant="caption" tone="muted">
            Contact has explicitly opted in to marketing
          </Text>
          {consentDate ? (
            <Text variant="caption" tone="secondary">
              Last consent recorded {consentDate}
            </Text>
          ) : null}
        </View>
        <Switch value={marketingConsent} onValueChange={onConsentChange} disabled={disabled} />
      </View>

      <Text variant="caption" tone={permitted ? 'success' : 'muted'} style={styles.warning}>
        {marketingPermissionSummary({
          marketing_consent: marketingConsent,
          marketing_opt_out: marketingOptOut,
        })}
      </Text>
    </>
  );

  if (collapsible) {
    return (
      <CollapsibleCard
        title="Marketing preferences"
        summary={summary}
        defaultExpanded={defaultExpanded}>
        {body}
      </CollapsibleCard>
    );
  }

  return (
    <Card>
      <Text variant="label" style={styles.title}>
        Marketing preferences
      </Text>
      {body}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowSeparated: {
    marginTop: spacing.md,
  },
  labelBlock: {
    flex: 1,
    gap: 2,
  },
  warning: {
    marginTop: spacing.sm,
  },
});
