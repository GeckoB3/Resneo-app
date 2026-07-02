import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ComplianceRequirementsEditor } from '@/components/compliance/ComplianceRequirementsEditor';
import { CompliancePill } from '@/components/ui/Badge';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { useComplianceRequirementCounts } from '@/lib/queries/useComplianceRequirements';
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

  // At-a-glance markers: requirement counts for every listed service (shares
  // the editor's per-service cache, so expanding a marked service is instant).
  const serviceIds = useMemo(() => services.map((s) => s.id), [services]);
  const requirementCounts = useComplianceRequirementCounts(serviceIds, complianceEnabled);

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
      {services.map((service) => {
        const count = requirementCounts.get(service.id) ?? 0;
        return (
          <CollapsibleCard
            key={service.id}
            title={service.name}
            // Mark services that already require a record so staff can see the
            // coverage at a glance without expanding each one.
            marker={
              count > 0 ? (
                <CompliancePill
                  tone="current"
                  label={count === 1 ? '1 required' : `${count} required`}
                />
              ) : undefined
            }
            summary={service.is_active === false ? 'Inactive' : null}
            lazy
            animateLayout={false}>
            <ComplianceRequirementsEditor
              serviceId={service.id}
              complianceEnabled={complianceEnabled}
              embedded
            />
          </CollapsibleCard>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.base,
  },
});
