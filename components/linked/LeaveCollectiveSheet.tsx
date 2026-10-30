/**
 * Leaving a collective (CQ-10.1; web `LeaveCollectiveDialog`, 2026-10-29): one sheet for the Venue
 * collectives row, Manage Collective's Leave, and "Leave instead" when a link change would take the
 * venue out anyway.
 *
 * Before the member confirms it says what leaving changes, read from the server: how many services
 * from the host become the venue's own, any that stop taking payments online without Stripe, that
 * bookings made through the page stay, that the venue's account links stay, and, when it is the last
 * venue with the host, that the collective ends. Leave stays off until that has loaded. A collective
 * not on shared services answers the preview with 409, and the sheet says what it always said.
 *
 * Afterwards the review (the checklist of services to look over) is put in the cache, and the venue
 * lands on Venue collectives, which shows it at the top.
 *
 * `LeaveCollectivePanel` is the content alone, for a sheet that is already open (the link sheets show
 * it in place rather than stacking a second sheet, which iOS can refuse to present).
 */
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { areaCopy, formatVenueList } from '@/lib/collective-area/copy';
import { leaveCollectiveMessage } from '@/lib/linked/collective-membership-copy';
import { useLeaveCollective, useLeavePreview, type LeavePreview } from '@/lib/queries/useLeaveCollective';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** The preview's bullet lines, in the web's order; `warn` lines are shown in the warning colour. */
export function leavePreviewLines(preview: LeavePreview, collective: string): { key: string; text: string; warn?: boolean }[] {
  const host = preview.host_name;
  const lines: { key: string; text: string; warn?: boolean }[] = [];
  if (preview.services > 0) {
    lines.push({
      key: 'services',
      text:
        preview.services === 1
          ? areaCopy('leave.body.servicesOne', { host })
          : areaCopy('leave.body.services', { count: preview.services, host }),
    });
  }
  if (preview.no_stripe > 0) {
    lines.push({
      key: 'stripe',
      warn: true,
      text:
        preview.no_stripe === 1 && preview.services === 1
          ? areaCopy('leave.body.noStripeOne')
          : areaCopy('leave.body.noStripe', { count: preview.no_stripe }),
    });
  }
  lines.push({ key: 'bookings', text: areaCopy('leave.body.bookings', { collective }) });
  if (preview.other_venues.length > 0) {
    lines.push({ key: 'access', text: areaCopy('leave.body.access', { venueList: formatVenueList(preview.other_venues, 3) }) });
  }
  return lines;
}

export interface LeaveTarget {
  id: string;
  name: string;
  /** `replicas` for shared services; older payloads omit it. */
  serviceModel?: string | null;
}

export function LeaveCollectivePanel({
  collective,
  active,
  onCancel,
  onLeft,
}: {
  collective: LeaveTarget;
  /** Whether the panel is showing, so the preview is read only then. */
  active: boolean;
  onCancel: () => void;
  /** After leaving; the caller closes its sheet. Defaults to Venue collectives. */
  onLeft?: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const previewQuery = useLeavePreview(collective.id, active);
  const leave = useLeaveCollective(collective.id);
  const [error, setError] = useState<string | null>(null);

  const preview = previewQuery.data ?? null;
  // 409: not on shared services, so there is no preview to give. Today's words, and leaving allowed.
  const noPreview = previewQuery.error instanceof ApiError && previewQuery.error.status === 409;
  const loadError =
    previewQuery.isError && !noPreview
      ? previewQuery.error instanceof ApiError
        ? previewQuery.error.message
        : 'Could not load what leaving changes. Please check your connection.'
      : null;
  const name = preview?.collective_name ?? collective.name;
  const busy = leave.isPending;
  const ready = !!preview || noPreview;

  const doLeave = () => {
    setError(null);
    leave.mutate(undefined, {
      onSuccess: () => {
        toast.success(areaCopy('leave.done', { collective: name }));
        if (onLeft) onLeft();
        else router.replace('/collectives' as Href);
      },
      onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not leave. Please check your connection.'),
    });
  };

  return (
    <View style={styles.body} testID="leave-collective-panel">
      <Text variant="subheading">{areaCopy('leave.title', { collective: name })}</Text>
      {error || loadError ? (
        <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
          {error ?? loadError}
        </Text>
      ) : null}
      {preview ? (
        <>
          <Text variant="bodySmall" tone="secondary">
            {areaCopy('leave.message', { host: preview.host_name })}
          </Text>
          {leavePreviewLines(preview, name).map((line) => (
            <View key={line.key} style={styles.bullet}>
              <Text variant="bodySmall" color={line.warn ? colors.warning : undefined}>
                {'•'}
              </Text>
              <Text variant="bodySmall" color={line.warn ? colors.warning : undefined} style={styles.flex1}>
                {line.text}
              </Text>
            </View>
          ))}
          {preview.last_member ? (
            <Text variant="bodySmall" color={colors.warning} style={styles.strong}>
              {areaCopy('leave.body.lastMember', { collective: name })}
            </Text>
          ) : null}
        </>
      ) : noPreview ? (
        <Text variant="bodySmall" tone="secondary">
          {leaveCollectiveMessage(collective)}
        </Text>
      ) : !loadError ? (
        <Text variant="bodySmall" tone="muted" accessibilityRole="progressbar">
          Loading...
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button label="Go back" variant="secondary" style={styles.flex1} disabled={busy} onPress={onCancel} />
        <Button
          label={areaCopy('leave.confirm', { collective: name })}
          variant="danger"
          style={styles.flex1}
          disabled={!ready || busy}
          loading={busy}
          onPress={doLeave}
        />
      </View>
    </View>
  );
}

export function LeaveCollectiveSheet({
  collective,
  visible,
  onClose,
  onLeft,
}: {
  collective: LeaveTarget | null;
  visible: boolean;
  onClose: () => void;
  /** After leaving, once the sheet has closed. Defaults to Venue collectives, where the review shows. */
  onLeft?: () => void;
}) {
  const router = useRouter();
  if (!collective) return null;
  return (
    <Sheet visible={visible} onClose={onClose}>
      <LeaveCollectivePanel
        collective={collective}
        active={visible}
        onCancel={onClose}
        onLeft={() => {
          onClose();
          if (onLeft) onLeft();
          else router.replace('/collectives' as Href);
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  bullet: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  strong: {
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
});
