import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatPence } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useCancelCourseEnrollment,
  useCourseEnrollments,
} from '@/lib/queries/useClassProducts';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { minTouchTarget, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  CourseEnrollment,
  CourseSessionEnrollment,
} from '@/types/class-products';

type CourseEnrollmentsSheetProps = {
  /** The course to manage enrollments for; null closes the sheet. */
  course: { id: string; name: string } | null;
  onClose: () => void;
};

const ENROLLMENT_TONE: Record<string, BadgeTone> = {
  pending_payment: 'warning',
  active: 'success',
  cancelled: 'neutral',
  completed: 'neutral',
};

/** Human name from the best-effort guest row. */
function guestDisplayName(g: CourseEnrollment['guest']): string {
  if (!g) return 'Guest';
  return [g.first_name, g.last_name].filter(Boolean).join(' ').trim() || g.email || 'Guest';
}

/** "Cancelled. £45.00 refunded." style success copy from the cancel result. */
export function cancelToastMessage(refundPence: number | null | undefined): string {
  if (refundPence != null && refundPence > 0) {
    return `Enrollment cancelled. ${formatPence(refundPence)} refunded.`;
  }
  return 'Enrollment cancelled — no refund was issued.';
}

/**
 * Course enrollments — opened from the Class products screen's course card. Lists
 * every enrollee with status + per-session attendance, and lets an admin cancel
 * an enrollment. A normal cancel auto-refunds the Stripe PI when inside the
 * course's cancellation window; "Force-cancel" (an admin-only escape hatch)
 * cancels past the window with NO auto-refund. The refunded amount is surfaced
 * in a Toast (web parity), and the in-window cancel returns 409 past the window
 * which we surface so staff know to force-cancel.
 *
 * Port of the web `CourseEnrollmentsPanel`, over the same Bearer-capable
 * `class-course-products/[id]/enrollments(/[enrId]/cancel)` routes.
 */
export function CourseEnrollmentsSheet({ course, onClose }: CourseEnrollmentsSheetProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const { venue } = useVenueContext();
  const isAdmin = venue?.current_user_role === 'admin';

  const query = useCourseEnrollments(course?.id ?? null);
  const cancelEnrollment = useCancelCourseEnrollment();

  // Which enrollment row is expanded to show its per-session attendance.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Confirm targets: a normal (auto-refund) cancel vs a force-cancel (no refund).
  const [cancelTarget, setCancelTarget] = useState<CourseEnrollment | null>(null);
  const [forceTarget, setForceTarget] = useState<CourseEnrollment | null>(null);
  const [forceReason, setForceReason] = useState('');

  const enrollments = query.data?.enrollments ?? [];
  const active = enrollments.filter((e) => e.status !== 'cancelled');
  const cancelled = enrollments.filter((e) => e.status === 'cancelled');

  // class_instance_id → human "ClassName · date time" line. Best-effort: the
  // enrollments route only returns ids, so we show the date pulled from the
  // session link's instance id is not available — fall back to the raw status
  // line keyed by the link. (Web shows the same per-session status badges.)
  const sessionsByEnrolment = useMemo(() => {
    const map = new Map<string, CourseSessionEnrollment[]>();
    for (const s of query.data?.session_enrollments ?? []) {
      const arr = map.get(s.enrollment_id) ?? [];
      arr.push(s);
      map.set(s.enrollment_id, arr);
    }
    return map;
  }, [query.data?.session_enrollments]);

  const runCancel = useCallback(
    (enrollment: CourseEnrollment, bypass: boolean, reason: string) => {
      if (!course) return;
      cancelEnrollment.mutate(
        {
          courseId: course.id,
          enrollmentId: enrollment.id,
          bypass_window: bypass,
          cancel_reason: reason.trim() || undefined,
        },
        {
          onSuccess: (result) => {
            hapticSuccess();
            setCancelTarget(null);
            setForceTarget(null);
            setForceReason('');
            toast.success(cancelToastMessage(result.refund_amount_pence));
          },
          onError: (e) => {
            hapticWarning();
            // 409 = past the window on a non-bypass cancel. Keep the sheet open
            // and point the admin at Force-cancel.
            if (e instanceof ApiError && e.status === 409) {
              setCancelTarget(null);
              toast.error(
                'The refund window has passed. Use Force-cancel to cancel without an auto-refund.',
              );
              return;
            }
            toast.error(
              e instanceof ApiError ? e.message : 'Could not cancel this enrollment.',
            );
          },
        },
      );
    },
    [course, cancelEnrollment, toast],
  );

  return (
    <>
      <Sheet visible={course !== null} onClose={onClose} maxHeight="92%" fill>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="subheading" numberOfLines={1}>
              Enrollments
            </Text>
            {course ? (
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {course.name}
              </Text>
            ) : null}
          </View>
          <IconButton
            icon={{ ios: 'xmark', android: 'close', web: 'close' }}
            accessibilityLabel="Close"
            tint={colors.textSecondary}
            onPress={onClose}
          />
        </View>

        {query.isLoading ? (
          <ListSkeleton avatar />
        ) : query.isError ? (
          <View style={styles.stateWrap}>
            <ErrorState
              message={
                query.error instanceof ApiError
                  ? query.error.message
                  : 'Could not load enrollments.'
              }
              onRetry={() => void query.refetch()}
            />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={query.isRefetching}
                onRefresh={() => void query.refetch()}
                tintColor={colors.brand}
              />
            }>
            {enrollments.length === 0 ? (
              <EmptyState
                title="No enrollments yet"
                message="When guests enroll in this course, they will appear here."
              />
            ) : (
              active.map((e) => {
                const sessions = sessionsByEnrolment.get(e.id) ?? [];
                const attended = sessions.filter((s) => s.status === 'attended').length;
                const total = sessions.length;
                const isOpen = expandedId === e.id;
                const rowBusy =
                  cancelEnrollment.isPending &&
                  (cancelTarget?.id === e.id || forceTarget?.id === e.id);
                return (
                  <Card key={e.id} style={styles.enrollCard}>
                    <View style={styles.enrollHeader}>
                      <View style={styles.enrollText}>
                        <Text variant="bodyMedium" numberOfLines={1}>
                          {guestDisplayName(e.guest)}
                        </Text>
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {e.guest?.email ?? '—'} · enrolled {e.created_at.slice(0, 10)}
                        </Text>
                      </View>
                      <Badge label={e.status} tone={ENROLLMENT_TONE[e.status] ?? 'neutral'} />
                    </View>

                    <Text variant="caption" tone="secondary">
                      {total > 0
                        ? `${attended} / ${total} sessions attended`
                        : 'No sessions linked yet'}
                    </Text>

                    {isOpen && sessions.length > 0 ? (
                      <View style={styles.sessionList}>
                        {sessions.map((s) => (
                          <View key={s.id} style={styles.sessionRow}>
                            <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.flex1}>
                              {s.class_instance_id.slice(0, 8)}
                            </Text>
                            <Badge label={s.status} tone={s.status === 'attended' ? 'success' : 'neutral'} />
                          </View>
                        ))}
                      </View>
                    ) : null}

                    <View style={styles.actionsRow}>
                      {sessions.length > 0 ? (
                        <Button
                          label={isOpen ? 'Hide sessions' : 'Show sessions'}
                          variant="ghost"
                          size="sm"
                          onPress={() => setExpandedId(isOpen ? null : e.id)}
                        />
                      ) : null}
                      {isAdmin ? (
                        <>
                          <Button
                            label="Cancel"
                            variant="secondary"
                            size="sm"
                            disabled={rowBusy}
                            onPress={() => {
                              setForceReason('');
                              setCancelTarget(e);
                            }}
                          />
                          <Button
                            label="Force-cancel"
                            variant="ghost"
                            size="sm"
                            customColors={{ background: 'transparent', text: colors.danger }}
                            disabled={rowBusy}
                            onPress={() => {
                              setForceReason('');
                              setForceTarget(e);
                            }}
                          />
                        </>
                      ) : null}
                    </View>
                  </Card>
                );
              })
            )}

            {cancelled.length > 0 ? (
              <View style={styles.cancelledWrap}>
                <Text variant="overline" tone="muted">
                  {cancelled.length} cancelled
                </Text>
                {cancelled.map((e) => (
                  <Text key={e.id} variant="caption" tone="muted" numberOfLines={1}>
                    {guestDisplayName(e.guest)} — cancelled {e.updated_at.slice(0, 10)}
                  </Text>
                ))}
              </View>
            ) : null}

            {!isAdmin ? (
              <Text variant="caption" tone="muted">
                Cancelling an enrollment and issuing refunds is admin-only.
              </Text>
            ) : null}
            <View style={styles.spacer} />
          </ScrollView>
        )}
      </Sheet>

      {/* Normal cancel — auto-refund when inside the window. */}
      <Sheet
        visible={cancelTarget !== null}
        onClose={() => {
          if (!cancelEnrollment.isPending) setCancelTarget(null);
        }}>
        <View style={styles.confirmSheet}>
          <Text variant="subheading">Cancel enrollment</Text>
          {cancelTarget ? (
            <Text variant="bodySmall" tone="secondary">
              Cancel {guestDisplayName(cancelTarget.guest)}&apos;s enrollment? If they are inside the
              refund window, their payment is refunded automatically and they are notified.
            </Text>
          ) : null}
          <View style={styles.actionsRow}>
            <Button
              label="Keep"
              variant="secondary"
              style={styles.flex1}
              disabled={cancelEnrollment.isPending}
              onPress={() => setCancelTarget(null)}
            />
            <Button
              label="Cancel enrollment"
              variant="danger"
              style={styles.flex1}
              loading={cancelEnrollment.isPending}
              onPress={() => {
                if (cancelTarget) runCancel(cancelTarget, false, '');
              }}
            />
          </View>
        </View>
      </Sheet>

      {/* Force-cancel — past the window, NO auto-refund (admin must arrange it). */}
      <Sheet
        visible={forceTarget !== null}
        onClose={() => {
          if (!cancelEnrollment.isPending) {
            setForceTarget(null);
            setForceReason('');
          }
        }}>
        <View style={styles.confirmSheet}>
          <Text variant="subheading">Force-cancel enrollment</Text>
          {forceTarget ? (
            <Text variant="bodySmall" tone="secondary">
              Force-cancel {guestDisplayName(forceTarget.guest)}&apos;s enrollment past the refund
              window. No refund is issued automatically — arrange any refund manually.
            </Text>
          ) : null}
          <Input
            label="Reason"
            optional
            value={forceReason}
            onChangeText={setForceReason}
            maxLength={500}
            placeholder="e.g. Course cancelled"
          />
          <View style={styles.actionsRow}>
            <Button
              label="Keep"
              variant="secondary"
              style={styles.flex1}
              disabled={cancelEnrollment.isPending}
              onPress={() => {
                setForceTarget(null);
                setForceReason('');
              }}
            />
            <Button
              label="Force-cancel"
              variant="danger"
              style={styles.flex1}
              loading={cancelEnrollment.isPending}
              onPress={() => {
                if (forceTarget) runCancel(forceTarget, true, forceReason);
              }}
            />
          </View>
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  enrollCard: {
    gap: spacing.xs,
  },
  enrollHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  enrollText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  sessionList: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: minTouchTarget,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  cancelledWrap: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  flex1: {
    flex: 1,
  },
  spacer: {
    height: spacing.xl,
  },
  confirmSheet: {
    gap: spacing.md,
  },
});
