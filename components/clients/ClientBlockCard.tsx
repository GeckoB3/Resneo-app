import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useBlockClient,
  useClientBlock,
  useUnblockClient,
  type ClientBlockSummary,
} from '@/lib/queries/useClientBlock';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Blocking a client from booking online (web Docs/blocked-clients-plan.md §5, 2026-11-19): the
 * banner on a blocked client with Unblock, and the Block button and sheet. Same words as the web.
 */

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatBookingDay(date: string, time: string | null): string {
  const d = new Date(`${date}T12:00:00`);
  const day = Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return time ? `${day} at ${time.slice(0, 5)}` : day;
}

/** The strip on a blocked client: who blocked, when, why, and Unblock. Nothing when not blocked. */
export function ClientBlockBanner({ guestId }: { guestId: string }) {
  const { colors } = useTheme();
  const toast = useToast();
  const query = useClientBlock(guestId);
  const unblock = useUnblockClient(guestId);
  const [confirming, setConfirming] = useState<ClientBlockSummary | null>(null);
  const blocks = query.data?.blocks ?? [];
  if (blocks.length === 0) return null;

  const runUnblock = async () => {
    if (!confirming) return;
    try {
      await unblock.mutateAsync(confirming.block_id);
      hapticSuccess();
      toast.success('Unblocked. They can book online again.');
      setConfirming(null);
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not unblock this client.');
    }
  };

  return (
    <View
      testID="client-block-banner"
      accessibilityRole="summary"
      style={[styles.banner, { backgroundColor: colors.dangerSurface, borderColor: colors.danger }]}>
      {blocks.map((block) => (
        <View key={block.block_id} style={styles.bannerRow}>
          <Text variant="bodyMedium">
            {block.own ? 'Blocked from booking online' : `Blocked by ${block.venue_name}`}
          </Text>
          <Text variant="bodySmall" tone="secondary">
            {block.own
              ? `Since ${formatDay(block.blocked_at)}${block.blocked_by_name ? `, by ${block.blocked_by_name}` : ''}. They cannot book online; you can still book them here.`
              : `Since ${formatDay(block.blocked_at)}. They cannot book online with any business in your collective; you can still book them here.`}
          </Text>
          {block.reason ? (
            <Text variant="bodySmall">{`Reason: ${block.reason}`}</Text>
          ) : null}
          {block.through_client_name ? (
            <Text variant="caption" tone="secondary">{`This comes from ${block.through_client_name}, who shares this client's email or phone. To unblock, open ${block.through_client_name}'s record.`}</Text>
          ) : null}
          {!block.own && !block.can_unblock ? (
            <Text variant="caption" tone="secondary">{`Ask ${block.venue_name} to unblock them.`}</Text>
          ) : null}
          {block.can_unblock ? (
            <Button
              label="Unblock"
              variant="secondary"
              size="sm"
              onPress={() => setConfirming(block)}
              style={styles.unblockButton}
              testID="client-unblock-button"
            />
          ) : null}
        </View>
      ))}
      <ConfirmSheet
        visible={confirming !== null}
        title="Unblock this client?"
        message={
          confirming && !confirming.own
            ? `${confirming.venue_name} blocked them. Unblocking lifts it for every business in your collective.`
            : 'They will be able to book online again. Any waitlist places closed when they were blocked stay closed.'
        }
        confirmLabel="Unblock"
        destructive={false}
        loading={unblock.isPending}
        onConfirm={() => void runUnblock()}
        onClose={() => setConfirming(null)}
      />
    </View>
  );
}

/** "Block client" in the client's Admin card, for admins while this business has not blocked them. */
export function BlockClientButton({
  guestId,
  guestName,
  businessName,
}: {
  guestId: string;
  guestName: string;
  /** Named in the words the client would see. */
  businessName: string;
}) {
  const state = useClientBlock(guestId);
  const [open, setOpen] = useState(false);
  if (!state.data?.can_block) return null;
  return (
    <>
      <Button
        label="Block client"
        variant="secondary"
        fullWidth
        onPress={() => setOpen(true)}
        testID="block-client-button"
        style={styles.blockButton}
      />
      {open ? (
        <BlockClientSheet
          guestId={guestId}
          guestName={guestName}
          businessName={businessName}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function BlockClientSheet({
  guestId,
  guestName,
  businessName,
  onClose,
}: {
  guestId: string;
  guestName: string;
  businessName: string;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const preview = useClientBlock(guestId, { preview: true });
  const block = useBlockClient(guestId);
  const [reason, setReason] = useState('');
  const p = preview.data?.preview ?? null;
  const available = preview.data?.available ?? true;

  const confirm = async () => {
    try {
      await block.mutateAsync(reason);
      hapticSuccess();
      toast.success(`${guestName} is blocked from booking online.`);
      onClose();
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not block this client.');
    }
  };

  return (
    <Sheet visible onClose={onClose}>
      <View style={styles.sheetBody} testID="block-client-sheet">
        <Text variant="subheading">{`Block ${guestName}?`}</Text>
        {!available ? (
          <View style={[styles.note, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
            <Text variant="bodySmall">Blocking clients is not set up yet. Please contact ResNeo support.</Text>
          </View>
        ) : null}
        <Text variant="bodySmall" tone="secondary">
          {`${guestName} will not be able to book online. When they try, they will see: “We can't take this booking online. Please contact ${businessName} to book.” It never says they are blocked. You can still book them yourself.`}
        </Text>
        {p?.scope.collective ? (
          <View style={[styles.note, { backgroundColor: colors.brandSubtle, borderColor: colors.brand }]}>
            <Text variant="bodySmall">{`This applies at all ${p.scope.business_count} businesses in your collective.`}</Text>
          </View>
        ) : null}
        {preview.data && !preview.data.has_contact_details ? (
          <View style={[styles.note, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
            <Text variant="bodySmall">
              This client has no email or phone number, so online bookings cannot be matched to them. The block will
              show on their record only.
            </Text>
          </View>
        ) : null}
        {p && p.shared_with.length > 0 ? (
          <View style={[styles.note, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
            <Text variant="bodyMedium">Other clients share this email or phone</Text>
            <Text variant="bodySmall">
              {`${p.shared_with.map((s) => s.name).join(', ')} will not be able to book online with these details either.`}
            </Text>
          </View>
        ) : null}
        {p && p.upcoming.length > 0 ? (
          <View style={styles.list}>
            <Text variant="bodyMedium">Their upcoming bookings stay</Text>
            {p.upcoming.slice(0, 5).map((b) => (
              <Text key={b.id} variant="bodySmall" tone="secondary">
                {`• ${formatBookingDay(b.booking_date, b.booking_time)}`}
              </Text>
            ))}
            {p.upcoming.length > 5 ? (
              <Text variant="caption" tone="muted">{`And ${p.upcoming.length - 5} more.`}</Text>
            ) : null}
            <Text variant="caption" tone="muted">
              Cancel any that should not go ahead. They can still cancel online.
            </Text>
          </View>
        ) : null}
        {p && p.standing_class_bookings > 0 ? (
          <Text variant="bodySmall">
            {p.standing_class_bookings === 1
              ? 'Their repeat class booking carries on. Cancel it separately if it should stop.'
              : `Their ${p.standing_class_bookings} repeat class bookings carry on. Cancel them separately if they should stop.`}
          </Text>
        ) : null}
        {p && p.waitlist_places > 0 ? (
          <Text variant="bodySmall">
            {p.waitlist_places === 1
              ? 'We will take them off the waitlist, so they are not offered a slot they cannot book.'
              : `We will take them off ${p.waitlist_places} waitlist places, so they are not offered a slot they cannot book.`}
          </Text>
        ) : null}
        <Input
          label="Reason"
          optional
          helper="Only your team sees this."
          value={reason}
          onChangeText={setReason}
          maxLength={500}
          multiline
        />
        <View style={styles.actions}>
          <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={onClose} disabled={block.isPending} />
          <Button
            label="Block client"
            variant="danger"
            style={styles.flex1}
            loading={block.isPending}
            disabled={!available || block.isPending}
            onPress={() => void confirm()}
            testID="block-client-confirm"
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  bannerRow: {
    gap: spacing.xs,
  },
  unblockButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  blockButton: {
    marginBottom: spacing.sm,
  },
  sheetBody: {
    gap: spacing.md,
  },
  note: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  list: {
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
});
