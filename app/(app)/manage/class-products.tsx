import { Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import {
  CourseEditorSheet,
  CreditEditorSheet,
  MembershipEditorSheet,
  type CourseEditorTarget,
  type CreditEditorTarget,
  type MembershipEditorTarget,
} from '@/components/classes/ClassProductEditors';
import { CourseEnrollmentsSheet } from '@/components/classes/CourseEnrollmentsSheet';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { SearchBar } from '@/components/ui/SearchBar';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatPence } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useClassCommerceEnabled,
  useClassCommerceReports,
  useClassCourseProducts,
  useClassCreditProducts,
  useClassMembershipProducts,
  useDeleteCourseProduct,
  useDeleteCreditProduct,
  useDeleteMembershipProduct,
  useUpdateCourseProduct,
  useUpdateCreditProduct,
  useUpdateMembershipProduct,
} from '@/lib/queries/useClassProducts';
import { useManagedClasses } from '@/lib/queries/useClassesManage';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  ClassCourseProduct,
  ClassCreditProduct,
  ClassInstanceOption,
  ClassMembershipProduct,
  ClassTypeOption,
} from '@/types/class-products';

type Tab = 'credits' | 'courses' | 'memberships';

/** Active/Archived pill. */
function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge label="Active" tone="success" />
  ) : (
    <Badge label="Archived" tone="neutral" />
  );
}

/** A compact metric tile in the stats bar. */
function Stat({ label, value }: { label: string; value: string | number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text variant="title">{value}</Text>
      <Text variant="caption" tone="muted" numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/** Shared product-card action row (Edit / Archive / Delete + an optional extra). */
function ProductActions({
  active,
  onEdit,
  onArchive,
  onDelete,
  archiving,
  extra,
}: {
  active: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  archiving: boolean;
  extra?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.actionsRow}>
      <Button label="Edit" variant="secondary" size="sm" onPress={onEdit} />
      {extra}
      <Button
        label={active ? 'Archive' : 'Reactivate'}
        variant="ghost"
        size="sm"
        loading={archiving}
        onPress={onArchive}
      />
      <Button
        label="Delete"
        variant="ghost"
        size="sm"
        customColors={{ background: 'transparent', text: colors.danger }}
        onPress={onDelete}
      />
    </View>
  );
}

/**
 * Class products — credit packs, fixed-session courses (with enrollment
 * management + refunds) and recurring memberships. Gated on
 * {@link useClassCommerceEnabled}; reached from the Classes manager. Wraps the
 * four Bearer-capable class-commerce route groups (see useClassProducts.ts).
 * Every route also enforces the plan gate server-side (403), so this screen is a
 * UI affordance and degrades to a clear message if the flag is off.
 */
export default function ClassProductsScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const { venue } = useVenueContext();
  const isAdmin = venue?.current_user_role === 'admin';
  const commerceEnabled = useClassCommerceEnabled();

  const [tab, setTab] = useState<Tab>('credits');
  const [search, setSearch] = useState('');

  // Lists — only fetched when the flag is on (avoids guaranteed-403 calls).
  const creditsQuery = useClassCreditProducts(commerceEnabled);
  const coursesQuery = useClassCourseProducts(commerceEnabled);
  const membershipsQuery = useClassMembershipProducts(commerceEnabled);
  const reportsQuery = useClassCommerceReports(commerceEnabled);
  // Picklists (class types + sessions) for the editors.
  const classesQuery = useManagedClasses();

  const updateCredit = useUpdateCreditProduct();
  const deleteCredit = useDeleteCreditProduct();
  const updateCourse = useUpdateCourseProduct();
  const deleteCourse = useDeleteCourseProduct();
  const updateMembership = useUpdateMembershipProduct();
  const deleteMembership = useDeleteMembershipProduct();

  const [creditTarget, setCreditTarget] = useState<CreditEditorTarget | null>(null);
  const [courseTarget, setCourseTarget] = useState<CourseEditorTarget | null>(null);
  const [membershipTarget, setMembershipTarget] = useState<MembershipEditorTarget | null>(null);
  const [enrollmentsCourse, setEnrollmentsCourse] = useState<{ id: string; name: string } | null>(
    null,
  );
  // A pending delete confirm: which list + the row.
  const [deleteTarget, setDeleteTarget] = useState<
    { kind: Tab; id: string; name: string } | null
  >(null);

  const classTypes = useMemo<ClassTypeOption[]>(
    () =>
      (classesQuery.data?.class_types ?? []).map((ct) => ({
        id: ct.id,
        name: ct.name,
        is_active: ct.is_active,
      })),
    [classesQuery.data?.class_types],
  );
  const instances = useMemo<ClassInstanceOption[]>(
    () =>
      (classesQuery.data?.instances ?? [])
        .filter((i) => !i.is_cancelled)
        .map((i) => ({
          id: i.id,
          class_type_id: i.class_type_id,
          instance_date: i.instance_date,
          start_time: i.start_time,
          booked_spots: i.booked_spots,
        })),
    [classesQuery.data?.instances],
  );

  const credits = creditsQuery.data ?? [];
  const courses = coursesQuery.data ?? [];
  const memberships = membershipsQuery.data ?? [];

  const q = search.trim().toLowerCase();
  const matches = useCallback(
    (name: string) => !q || name.toLowerCase().includes(q),
    [q],
  );

  const refreshing =
    creditsQuery.isRefetching ||
    coursesQuery.isRefetching ||
    membershipsQuery.isRefetching ||
    reportsQuery.isRefetching;
  const onRefresh = useCallback(() => {
    void creditsQuery.refetch();
    void coursesQuery.refetch();
    void membershipsQuery.refetch();
    void reportsQuery.refetch();
    void classesQuery.refetch();
  }, [creditsQuery, coursesQuery, membershipsQuery, reportsQuery, classesQuery]);

  // Generic archive (PATCH active) + delete handlers, keyed by tab.
  const onArchive = useCallback(
    (kind: Tab, id: string, active: boolean) => {
      const onSuccess = () => {
        hapticSuccess();
        toast.success(active ? 'Archived.' : 'Reactivated.');
      };
      const onError = (e: unknown) => {
        hapticWarning();
        toast.error(e instanceof ApiError ? e.message : 'Could not update the product.');
      };
      const patch = { active: !active };
      if (kind === 'credits') updateCredit.mutate({ id, patch }, { onSuccess, onError });
      else if (kind === 'courses') updateCourse.mutate({ id, patch }, { onSuccess, onError });
      else updateMembership.mutate({ id, patch }, { onSuccess, onError });
    },
    [updateCredit, updateCourse, updateMembership, toast],
  );

  const deletePending =
    deleteCredit.isPending || deleteCourse.isPending || deleteMembership.isPending;
  const onConfirmDelete = useCallback(() => {
    const t = deleteTarget;
    if (!t) return;
    const onSuccess = () => {
      hapticSuccess();
      setDeleteTarget(null);
      toast.success('Deleted.');
    };
    const onError = (e: unknown) => {
      hapticWarning();
      // Keep the confirm open so the 409 "archive instead" message is readable.
      setDeleteTarget(null);
      toast.error(e instanceof ApiError ? e.message : 'Could not delete the product.');
    };
    if (t.kind === 'credits') deleteCredit.mutate(t.id, { onSuccess, onError });
    else if (t.kind === 'courses') deleteCourse.mutate(t.id, { onSuccess, onError });
    else deleteMembership.mutate(t.id, { onSuccess, onError });
  }, [deleteTarget, deleteCredit, deleteCourse, deleteMembership, toast]);

  // ----- Flag off / non-admin gates -------------------------------------
  if (!commerceEnabled) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Class products' }} />
        <EmptyState
          title="Class products not enabled"
          message="Prepaid credit packs, courses and memberships aren't enabled for this venue yet. Contact support to turn on class commerce."
        />
      </Screen>
    );
  }

  const archivingCredit = updateCredit.isPending;
  const archivingCourse = updateCourse.isPending;
  const archivingMembership = updateMembership.isPending;

  const activeCredits = credits.filter((p) => p.active).length;
  const activeCourses = courses.filter((p) => p.active).length;
  const activeMemberships = memberships.filter((p) => p.active).length;

  const listLoading =
    (tab === 'credits' && creditsQuery.isLoading) ||
    (tab === 'courses' && coursesQuery.isLoading) ||
    (tab === 'memberships' && membershipsQuery.isLoading);
  const listError =
    tab === 'credits'
      ? creditsQuery.error
      : tab === 'courses'
        ? coursesQuery.error
        : membershipsQuery.error;
  const isListError =
    (tab === 'credits' && creditsQuery.isError) ||
    (tab === 'courses' && coursesQuery.isError) ||
    (tab === 'memberships' && membershipsQuery.isError);

  return (
    <Screen scroll={false} padded={false}>
      <Stack.Screen options={{ title: 'Class products' }} />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }>
        {/* Stats bar — active product counts + class-commerce KPIs. */}
        <View style={styles.statsRow}>
          <Stat label="Active packs" value={activeCredits} />
          <Stat label="Active courses" value={activeCourses} />
          <Stat label="Active memberships" value={activeMemberships} />
        </View>
        {reportsQuery.data ? (
          <View style={styles.statsRow}>
            <Stat
              label="Outstanding class credits"
              value={reportsQuery.data.outstanding_credit_units}
            />
            <Stat
              label="Class checkout (30 days)"
              value={formatPence(reportsQuery.data.checkout_amount_pence_30d) ?? '£0.00'}
            />
          </View>
        ) : null}

        <Segmented<Tab>
          options={[
            { value: 'credits', label: 'Credit packs' },
            { value: 'courses', label: 'Courses' },
            { value: 'memberships', label: 'Memberships' },
          ]}
          value={tab}
          onChange={(next) => {
            setTab(next);
            setSearch('');
          }}
        />

        <Button
          label={
            tab === 'credits'
              ? 'New credit pack'
              : tab === 'courses'
                ? 'New course'
                : 'New membership'
          }
          fullWidth
          onPress={() => {
            if (tab === 'credits') setCreditTarget({ mode: 'create' });
            else if (tab === 'courses') setCourseTarget({ mode: 'create' });
            else setMembershipTarget({ mode: 'create' });
          }}
        />

        {(tab === 'credits' && credits.length > 0) ||
        (tab === 'courses' && courses.length > 0) ||
        (tab === 'memberships' && memberships.length > 0) ? (
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Filter by name"
            accessibilityLabel="Filter products"
          />
        ) : null}

        {listLoading ? (
          <ListSkeleton />
        ) : isListError ? (
          <ErrorState
            message={listError instanceof ApiError ? listError.message : 'Could not load products.'}
            onRetry={onRefresh}
          />
        ) : tab === 'credits' ? (
          <CreditList
            products={credits.filter((p) => matches(p.name))}
            empty={credits.length === 0}
            classTypeNames={classTypes}
            archiving={archivingCredit}
            onEdit={(product) => setCreditTarget({ mode: 'edit', product })}
            onArchive={(p) => onArchive('credits', p.id, p.active)}
            onDelete={(p) => setDeleteTarget({ kind: 'credits', id: p.id, name: p.name })}
          />
        ) : tab === 'courses' ? (
          <CourseList
            products={courses.filter((p) => matches(p.name))}
            empty={courses.length === 0}
            archiving={archivingCourse}
            onEdit={(product) => setCourseTarget({ mode: 'edit', product })}
            onArchive={(p) => onArchive('courses', p.id, p.active)}
            onDelete={(p) => setDeleteTarget({ kind: 'courses', id: p.id, name: p.name })}
            onEnrollments={(p) => setEnrollmentsCourse({ id: p.id, name: p.name })}
          />
        ) : (
          <MembershipList
            products={memberships.filter((p) => matches(p.name))}
            empty={memberships.length === 0}
            archiving={archivingMembership}
            onEdit={(product) => setMembershipTarget({ mode: 'edit', product })}
            onArchive={(p) => onArchive('memberships', p.id, p.active)}
            onDelete={(p) => setDeleteTarget({ kind: 'memberships', id: p.id, name: p.name })}
          />
        )}

        {!isAdmin ? (
          <Text variant="caption" tone="muted">
            Archiving and deleting products, and cancelling enrollments, is admin-only.
          </Text>
        ) : null}
        <View style={styles.spacer} />
      </ScrollView>

      <CreditEditorSheet
        target={creditTarget}
        classTypes={classTypes}
        onClose={() => setCreditTarget(null)}
      />
      <CourseEditorSheet
        target={courseTarget}
        classTypes={classTypes}
        instances={instances}
        onClose={() => setCourseTarget(null)}
      />
      <MembershipEditorSheet
        target={membershipTarget}
        classTypes={classTypes}
        onClose={() => setMembershipTarget(null)}
      />
      <CourseEnrollmentsSheet
        course={enrollmentsCourse}
        onClose={() => setEnrollmentsCourse(null)}
      />

      {/* Delete confirm — a Sheet (Alert.alert's confirm is a no-op on web). */}
      <Sheet visible={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <View style={styles.confirmSheet}>
          <Text variant="subheading">Delete product</Text>
          <Text variant="bodySmall" tone="secondary">
            Delete &quot;{deleteTarget?.name}&quot;? Archive it instead if guests have used it
            before — deletion is blocked while balances, enrollments or subscriptions reference it.
          </Text>
          <View style={styles.actionsRow}>
            <Button
              label="Cancel"
              variant="secondary"
              style={styles.flex1}
              disabled={deletePending}
              onPress={() => setDeleteTarget(null)}
            />
            <Button
              label="Delete"
              variant="danger"
              style={styles.flex1}
              loading={deletePending}
              onPress={onConfirmDelete}
            />
          </View>
        </View>
      </Sheet>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Per-tab lists
// ---------------------------------------------------------------------------

function CreditList({
  products,
  empty,
  classTypeNames,
  archiving,
  onEdit,
  onArchive,
  onDelete,
}: {
  products: ClassCreditProduct[];
  empty: boolean;
  classTypeNames: ClassTypeOption[];
  archiving: boolean;
  onEdit: (p: ClassCreditProduct) => void;
  onArchive: (p: ClassCreditProduct) => void;
  onDelete: (p: ClassCreditProduct) => void;
}) {
  if (empty) {
    return (
      <EmptyState
        title="No credit packs yet"
        message="Create an intro offer or class pass to start selling prepaid sessions."
      />
    );
  }
  if (products.length === 0) {
    return <EmptyState title="No matches" message="No credit packs match your filter." />;
  }
  return (
    <>
      {products.map((p) => (
        <Card key={p.id} style={styles.productCard}>
          <View style={styles.productHeader}>
            <Text variant="bodyMedium" numberOfLines={1} style={styles.flex1}>
              {p.name}
            </Text>
            <ActiveBadge active={p.active} />
          </View>
          <Text variant="caption" tone="secondary">
            {p.credits_count} credits · {formatPence(p.price_pence) ?? '—'}
          </Text>
          <Text variant="caption" tone="muted">
            {p.validity_days ? `${p.validity_days} day expiry` : 'No expiry'} ·{' '}
            {p.eligible_class_type_ids?.length
              ? `${p.eligible_class_type_ids.length} eligible class type${
                  p.eligible_class_type_ids.length === 1 ? '' : 's'
                }`
              : 'All classes'}
          </Text>
          {p.description ? (
            <Text variant="caption" tone="secondary">
              {p.description}
            </Text>
          ) : null}
          <ProductActions
            active={p.active}
            archiving={archiving}
            onEdit={() => onEdit(p)}
            onArchive={() => onArchive(p)}
            onDelete={() => onDelete(p)}
          />
        </Card>
      ))}
    </>
  );
}

function CourseList({
  products,
  empty,
  archiving,
  onEdit,
  onArchive,
  onDelete,
  onEnrollments,
}: {
  products: ClassCourseProduct[];
  empty: boolean;
  archiving: boolean;
  onEdit: (p: ClassCourseProduct) => void;
  onArchive: (p: ClassCourseProduct) => void;
  onDelete: (p: ClassCourseProduct) => void;
  onEnrollments: (p: ClassCourseProduct) => void;
}) {
  if (empty) {
    return (
      <EmptyState
        title="No courses yet"
        message="Create a fixed-session course or paid workshop series."
      />
    );
  }
  if (products.length === 0) {
    return <EmptyState title="No matches" message="No courses match your filter." />;
  }
  return (
    <>
      {products.map((p) => (
        <Card key={p.id} style={styles.productCard}>
          <View style={styles.productHeader}>
            <Text variant="bodyMedium" numberOfLines={1} style={styles.flex1}>
              {p.name}
            </Text>
            <ActiveBadge active={p.active} />
          </View>
          <Text variant="caption" tone="secondary">
            {formatPence(p.price_pence) ?? '—'} · {p.session_instance_ids.length} session
            {p.session_instance_ids.length === 1 ? '' : 's'}
          </Text>
          <Text variant="caption" tone="muted">
            {p.max_enrollments ? `${p.max_enrollments} enrollment cap` : 'No enrollment cap'}
            {p.cancellation_window_days != null
              ? ` · ${p.cancellation_window_days}d refund window`
              : ' · non-refundable'}
          </Text>
          {p.session_instance_ids.length === 0 ? (
            <Text variant="caption" tone="danger">
              No sessions selected yet.
            </Text>
          ) : null}
          {p.description ? (
            <Text variant="caption" tone="secondary">
              {p.description}
            </Text>
          ) : null}
          <ProductActions
            active={p.active}
            archiving={archiving}
            onEdit={() => onEdit(p)}
            onArchive={() => onArchive(p)}
            onDelete={() => onDelete(p)}
            extra={
              <Button
                label="Enrollments"
                variant="secondary"
                size="sm"
                onPress={() => onEnrollments(p)}
              />
            }
          />
        </Card>
      ))}
    </>
  );
}

function MembershipList({
  products,
  empty,
  archiving,
  onEdit,
  onArchive,
  onDelete,
}: {
  products: ClassMembershipProduct[];
  empty: boolean;
  archiving: boolean;
  onEdit: (p: ClassMembershipProduct) => void;
  onArchive: (p: ClassMembershipProduct) => void;
  onDelete: (p: ClassMembershipProduct) => void;
}) {
  if (empty) {
    return (
      <EmptyState
        title="No memberships yet"
        message="Create a membership plan with session allowances, discounts, or unlimited access."
      />
    );
  }
  if (products.length === 0) {
    return <EmptyState title="No matches" message="No memberships match your filter." />;
  }
  return (
    <>
      {products.map((p) => {
        const rules = p.rules ?? {};
        const billing = p.stripe_price_id
          ? p.stripe_product_id
            ? 'Stripe billing (auto)'
            : 'Stripe price connected'
          : 'needs billing setup';
        return (
          <Card key={p.id} style={styles.productCard}>
            <View style={styles.productHeader}>
              <Text variant="bodyMedium" numberOfLines={1} style={styles.flex1}>
                {p.name}
              </Text>
              <ActiveBadge active={p.active} />
            </View>
            <Text variant="caption" tone="secondary">
              {rules.unlimited
                ? 'Unlimited classes'
                : `${rules.allowance_per_period ?? 0} classes per period`}
            </Text>
            <Text variant="caption" tone="muted">
              {rules.rollover
                ? `rollover${rules.rollover_limit ? ` up to ${rules.rollover_limit}` : ''}`
                : 'no rollover'}
              {rules.discount_percent ? ` · ${rules.discount_percent}% discount` : ''} · {billing}
            </Text>
            {p.description ? (
              <Text variant="caption" tone="secondary">
                {p.description}
              </Text>
            ) : null}
            <ProductActions
              active={p.active}
              archiving={archiving}
              onEdit={() => onEdit(p)}
              onArchive={() => onArchive(p)}
              onDelete={() => onDelete(p)}
            />
          </Card>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    borderWidth: 1,
    borderRadius: spacing.sm,
    padding: spacing.md,
    gap: 2,
  },
  productCard: {
    gap: spacing.xs,
  },
  productHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
