import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ComplianceRequirementsEditor } from '@/components/compliance/ComplianceRequirementsEditor';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { useManagedServices } from '@/lib/queries/useServicesManage';
import { spacing } from '@/theme/index';

type Props = {
  /** `feature_flags.resolved.compliance_records_enabled`. */
  complianceEnabled: boolean;
};

/**
 * Service requirements panel — the app port of the web `ComplianceSettingsSection`
 * RequirementsPanel: a per-service accordion where each service expands into the
 * `ComplianceRequirementsEditor` (add / change enforcement, lead time and online
 * collection / remove). The same editor is also reachable inline from the
 * service editor, matching the web.
 */
export function ComplianceServiceRequirementsPanel({ complianceEnabled }: Props) {
  const servicesQuery = useManagedServices();

  const services = useMemo(
    () =>
      [...(servicesQuery.data?.services ?? [])].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name),
      ),
    [servicesQuery.data],
  );

  if (!complianceEnabled) {
    return (
      <EmptyState
        title="Compliance isn't enabled"
        message="Turn on compliance records in the General tab to set service requirements."
      />
    );
  }

  if (servicesQuery.isLoading) {
    return <DetailSkeleton />;
  }

  if (servicesQuery.isError) {
    return (
      <ErrorState
        message={
          servicesQuery.error instanceof ApiError
            ? servicesQuery.error.message
            : 'Could not load services.'
        }
        onRetry={() => void servicesQuery.refetch()}
      />
    );
  }

  if (services.length === 0) {
    return (
      <EmptyState
        title="No services yet"
        message="Create a service first, then choose which compliance records it requires."
      />
    );
  }

  return (
    <View style={styles.panel}>
      <Text variant="caption" tone="muted">
        Choose which compliance records each service requires before a booking. Missing or expired
        records warn or block at booking time.
      </Text>
      {services.map((service) => (
        <CollapsibleCard
          key={service.id}
          title={service.name}
          summary={service.is_active === false ? 'Inactive' : null}
          lazy
          animateLayout={false}>
          <ComplianceRequirementsEditor
            serviceId={service.id}
            complianceEnabled={complianceEnabled}
            embedded
          />
        </CollapsibleCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.base,
  },
});
