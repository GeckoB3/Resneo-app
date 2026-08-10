import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { GrantEditor } from '@/components/linked/GrantEditor';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { grantsEqual, isReductionOnly, normaliseGrant } from '@/lib/linked/grants';
import { useReduceAccess } from '@/lib/queries/useLinkedVenues';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AccountLinkView, LinkGrant } from '@/types/linked-venues';

/**
 * Reduce the access your venue grants the other venue, mirroring the web
 * `ReduceAccessModal` (Flow 5). A single `GrantEditor` over `link.theyCan`
 * (= what the other venue can do with YOUR data), locked to reductions: the
 * submit is gated by `isReductionOnly`, and a guidance banner appears if the
 * edit would increase access. POST .../reduce — immediate, no consent.
 */
export function ReduceAccessSheet({
  link,
  visible,
  myCalendars = [],
  onClose,
  onDone,
}: {
  link: AccountLinkView | null;
  visible: boolean;
  /** §18 — your own calendars, for the scope picker. */
  myCalendars?: { id: string; name: string }[];
  onClose: () => void;
  /** Called after a successful reduce. */
  onDone?: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const reduceAccess = useReduceAccess();

  const [grant, setGrant] = useState<LinkGrant>(
    link?.theyCan ?? { calendar: 'none', pii: false, act: 'none' },
  );

  useEffect(() => {
    if (visible && link) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGrant(link.theyCan);
    }
  }, [visible, link]);

  if (!link) return null;

  const name = link.otherVenue.name;
  const busy = reduceAccess.isPending;
  const current = normaliseGrant(link.theyCan);
  const next = normaliseGrant(grant);
  const isReduction = isReductionOnly(current, next);
  const hasChanged = !grantsEqual(current, next);
  const zeroWay = next.calendar === 'none' && normaliseGrant(link.iCan).calendar === 'none';

  const handleSubmit = () => {
    reduceAccess.mutate(
      { linkId: link.id, grant },
      {
        onSuccess: () => {
          toast.success(`Reduced ${name}’s access.`);
          onDone?.();
          onClose();
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Failed to reduce access.'),
      },
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="90%" fill>
      <View style={styles.container}>
        <View>
          <Text variant="subheading">{`Reduce ${name}’s access`}</Text>
          <Text variant="bodySmall" tone="secondary">
            Lower the access your venue grants. This takes effect immediately and does not need the
            other venue’s consent.
          </Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollBody}
          keyboardShouldPersistTaps="handled">
          <GrantEditor
            label={`What ${name} can do with your data`}
            value={grant}
            onChange={setGrant}
            disabled={busy}
            reductionOnly
            calendars={myCalendars}
          />

          {!isReduction ? (
            <View style={[styles.notice, { backgroundColor: colors.dangerSurface }]}>
              <Text variant="caption" tone="danger">
                This control can only reduce access. To grant more, use “Edit permissions”.
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          <Button label="Cancel" variant="ghost" disabled={busy} onPress={onClose} />
          <Button
            label="Reduce access"
            variant="danger"
            style={styles.flex1}
            disabled={busy || !isReduction || !hasChanged || zeroWay}
            loading={busy}
            onPress={handleSubmit}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // `fill` + a flexing ScrollView: the body outgrows the sheet, and a
  // content-sized one can't scroll AND pushes the pinned actions off the
  // bottom. `fill` Sheets supply no horizontal padding, so the container
  // carries the standard inset itself.
  container: {
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  scroll: {
    flex: 1,
  },
  scrollBody: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  notice: {
    borderRadius: radius.md,
    padding: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  flex1: {
    flex: 1,
  },
});
