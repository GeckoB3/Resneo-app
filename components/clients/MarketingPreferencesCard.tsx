import { format, parseISO } from 'date-fns';
import { StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { Text } from '@/components/ui/Text';
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

  const body = (
    <>
      <View style={styles.row}>
        <View style={styles.labelBlock}>
          <Text variant="bodySmall">Marketing consent</Text>
          <Text variant="caption" tone="muted">
            Contact has explicitly opted in to marketing
          </Text>
          {consentDate ? (
            <Text variant="caption" tone="secondary">
              Recorded {consentDate}
            </Text>
          ) : null}
        </View>
        <Switch
          value={marketingConsent}
          onValueChange={onConsentChange}
          disabled={disabled}
        />
      </View>

      <View style={[styles.row, styles.rowSeparated]}>
        <View style={styles.labelBlock}>
          <Text variant="bodySmall">Opted out</Text>
          <Text variant="caption" tone="muted">
            Contact has explicitly asked not to be contacted
          </Text>
        </View>
        <Switch
          value={marketingOptOut}
          onValueChange={onOptOutChange}
          disabled={disabled}
        />
      </View>

      {marketingOptOut ? (
        <Text variant="caption" tone="danger" style={styles.warning}>
          This contact has opted out — do not send marketing messages.
        </Text>
      ) : marketingConsent ? (
        <Text variant="caption" tone="success" style={styles.warning}>
          Consent recorded — this contact can receive marketing messages.
        </Text>
      ) : (
        <Text variant="caption" tone="muted" style={styles.warning}>
          No consent recorded. Contact may still receive transactional messages.
        </Text>
      )}
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
