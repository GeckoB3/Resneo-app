import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Text } from '@/components/ui/Text';
import { BuyPassSection } from '@/components/customer/passes/BuyPassSection';
import { nameById } from '@/components/customer/passes/lookup';
import { courseCancelConsequence } from '@/components/customer/passes/passes-copy';
import { useCancelCourse, useCourses, type CourseEnrollment } from '@/lib/queries/useCustomerPasses';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

/** Enrollments that are still running. */
const LIVE = new Set(['active', 'enrolled', 'in_progress']);

/**
 * Courses the customer is enrolled on.
 *
 * Cancelling names the refund WITHOUT naming a figure, because the amount is
 * prorated server-side at cancel time and depends on how many sessions have
 * already run. Printing a number here that the server then disagrees with is
 * worse than saying a refund is due and letting the venue confirm it.
 */
export function CoursesSection() {
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useCourses();
  const cancel = useCancelCourse();
  const [pending, setPending] = useState<CourseEnrollment | null>(null);

  const forSale = data?.purchase_catalog?.courses ?? [];
  const catalogVenues = data?.purchase_catalog?.venues ?? data?.venues;

  if (isLoading) return <LoadingState message="Loading your courses…" />;
  if (isError) {
    return <ErrorState message="Could not load your courses." onRetry={() => void refetch()} />;
  }

  const live = (data?.enrollments ?? []).filter((e) => LIVE.has(e.status));

  if (live.length === 0) {
    return (
      <View style={styles.list}>
        <EmptyState
          title="No courses"
          message="A course you sign up for will appear here, with how far through it you are."
        />
        {/* Offered with none held: an empty tab is where somebody looks for how
            to get one. */}
      <BuyPassSection
        heading="JOIN A COURSE"
        kind="course"
        products={forSale}
        venues={catalogVenues}
        note="A course is paid for once and covers every session in it. Any refund for leaving early is worked out by the venue."
      />
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {live.map((enrollment) => (
        <Card key={enrollment.id}>
          <Text variant="bodyMedium">
            {enrollment.course_name ?? nameById(data?.venues, enrollment.venue_id)}
          </Text>
          <Text variant="bodySmall" tone="secondary">
            {nameById(data?.venues, enrollment.venue_id)}
          </Text>
          {progressLine(enrollment) ? (
            <Text variant="bodySmall" tone="secondary" style={styles.gap}>
              {progressLine(enrollment)}
            </Text>
          ) : null}
          <Button
            label="Leave this course"
            variant="secondary"
            onPress={() => setPending(enrollment)}
            style={styles.gap}
          />
        </Card>
      ))}

      <BuyPassSection
        heading="JOIN A COURSE"
        kind="course"
        products={forSale}
        venues={catalogVenues}
        note="A course is paid for once and covers every session in it. Any refund for leaving early is worked out by the venue."
      />

      <ConfirmSheet
        visible={pending !== null}
        title="Leave this course?"
        message={courseCancelConsequence()}
        confirmLabel="Leave course"
        cancelLabel="Stay on it"
        loading={cancel.isPending}
        onClose={() => setPending(null)}
        onConfirm={() => {
          // Read into a local first: the sheet clears its own state on confirm,
          // so `pending` would be gone by the time the request was built.
          const target = pending;
          setPending(null);
          if (!target) return;
          cancel.mutate(
            { enrollmentId: target.id },
            {
              onSuccess: () => toast.success('You have left the course.'),
              onError: () => toast.error('Could not leave. Please ring the venue.'),
            },
          );
        }}
      />
    </View>
  );
}

/** How far through, when the server knows. Silent rather than guessing. */
function progressLine(enrollment: CourseEnrollment): string | null {
  const done = enrollment.sessions_attended;
  const total = enrollment.sessions_total;
  if (done == null || total == null || total <= 0) return null;
  return `${done} of ${total} sessions so far.`;
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  gap: { marginTop: spacing.sm },
});
