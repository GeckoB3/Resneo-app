/**
 * Small parts of the Collective area, each the app's version of a web piece
 * (`CollectivePills`, `CollectiveTodoStrip`, `CollectiveHostingControls` and the venue cards of
 * `CollectiveAreaClient`, 2026-09-17).
 */
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { areaCopy, HOST_TRANSFER_CONSENT_VERSION } from '@/lib/collective-area/copy';
import {
  groupStatus,
  venueCountsLine,
  type CollectiveCalendarGroup,
  type CollectiveTodo,
  type SyncStatus,
} from '@/lib/collective-area/model';
import { useCollectiveMembersPatch } from '@/lib/queries/useCollectiveArea';
import { useDissolveCollective } from '@/lib/queries/useCollectives';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ServiceCollectiveBlock } from '@/types/services-manage';

// ---------------------------------------------------------------------------
// Status badges (web VenueSyncPill)
// ---------------------------------------------------------------------------

const SYNC_BADGE: Record<ServiceCollectiveBlock['status'], { label: string; tone: BadgeTone }> = {
  up_to_date: { label: areaCopy('common.pill.upToDate'), tone: 'success' },
  updating: { label: areaCopy('common.pill.updating'), tone: 'brand' },
  setting_up: { label: areaCopy('common.pill.settingUp'), tone: 'brand' },
  failed: { label: areaCopy('common.pill.couldNotUpdate'), tone: 'danger' },
  hidden: { label: areaCopy('common.pill.hidden'), tone: 'warning' },
  paused: { label: areaCopy('common.pill.paused'), tone: 'warning' },
};

export function SyncBadge({ status, label }: { status: ServiceCollectiveBlock['status'] | SyncStatus; label?: string | null }) {
  const badge = SYNC_BADGE[status];
  return <Badge label={label ?? badge.label} tone={badge.tone} />;
}

// ---------------------------------------------------------------------------
// What needs you
// ---------------------------------------------------------------------------

export function TodoStrip({
  todos,
  onOpenService,
  onOpenVenue,
  onRetry,
}: {
  todos: CollectiveTodo[];
  onOpenService?: (serviceId: string) => void;
  onOpenVenue?: (venueId: string) => void;
  onRetry?: (venueId: string) => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  if (todos.length === 0) return null;
  return (
    <View style={[styles.todo, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
      <Text variant="label">{areaCopy('ov.todo.heading')}</Text>
      {todos.map((todo) => {
        const action = todo.action;
        const onPress = !action
          ? null
          : action.kind === 'payments'
            ? () => router.push('/manage/plan' as Href)
            : action.kind === 'forms'
              ? () => router.push('/manage/compliance-settings' as Href)
              : action.kind === 'service' && onOpenService
                ? () => onOpenService(action.serviceId)
                : action.kind === 'venue_calendars' && onOpenVenue
                  ? () => onOpenVenue(action.venueId)
                  : action.kind === 'retry' && onRetry
                    ? () => onRetry(action.venueId)
                    : null;
        return (
          <View key={todo.id} style={styles.todoRow}>
            <Text variant="bodySmall">{todo.text}</Text>
            {action && onPress ? (
              <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8}>
                <Text variant="label" tone="brand">
                  {action.label}
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// One card per venue: its name, how up to date it is, and what it carries
// ---------------------------------------------------------------------------

export function VenueHealthCards({
  groups,
  onRetry,
  retrying,
}: {
  groups: CollectiveCalendarGroup[];
  onRetry: (venueId: string) => void;
  retrying: boolean;
}) {
  if (groups.length === 0) return null;
  return (
    <View style={styles.cards}>
      {groups.map((group) => {
        const status = groupStatus(group);
        return (
          <Card key={group.venue_id} style={styles.venueCard}>
            <View style={styles.rowBetween}>
              <Text variant="label" style={styles.flex1} numberOfLines={2}>
                {group.is_host ? areaCopy('svc.cal.venueYou', { venue: group.venue_name }) : group.venue_name}
              </Text>
              <SyncBadge status={status} />
            </View>
            <Text variant="caption" tone="secondary">
              {venueCountsLine(group)}
            </Text>
            {status === 'failed' ? (
              <>
                <Text variant="caption" tone="danger">
                  {group.sync.failed[0]?.message ?? areaCopy('ov.venue.failed')}
                </Text>
                <Button
                  label={areaCopy('svc.save.retry')}
                  variant="ghost"
                  size="sm"
                  loading={retrying}
                  onPress={() => onRetry(group.venue_id)}
                />
              </>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Moving the hosting (web HostingRequestBanner, PausedHostingBanner, HostingConsentDialog)
// ---------------------------------------------------------------------------

function HostingConsentSheet({
  visible,
  onClose,
  collectiveName,
  hostName,
  onAccept,
  busy,
  error,
}: {
  visible: boolean;
  onClose: () => void;
  collectiveName: string;
  hostName: string;
  onAccept: () => void;
  busy: boolean;
  error: string | null;
}) {
  const { colors } = useTheme();
  const [agreed, setAgreed] = useState(false);
  return (
    <Sheet visible={visible} onClose={busy ? () => undefined : onClose}>
      <View style={styles.sheetBody}>
        <Text variant="subheading">{areaCopy('transfer.accept.title', { collective: collectiveName })}</Text>
        {error ? (
          <Text variant="bodySmall" tone="danger">
            {error}
          </Text>
        ) : null}
        {[
          areaCopy('transfer.accept.1'),
          areaCopy('transfer.accept.2', { host: hostName }),
          areaCopy('transfer.accept.3', { collective: collectiveName }),
          areaCopy('transfer.accept.4'),
        ].map((line) => (
          <Text key={line} variant="bodySmall" tone="secondary">
            {`• ${line}`}
          </Text>
        ))}
        <View style={styles.rowBetween}>
          <Text variant="label" style={styles.flex1}>
            {areaCopy('transfer.accept.consent', { collective: collectiveName })}
          </Text>
          <Switch
            value={agreed}
            onValueChange={setAgreed}
            accessibilityLabel={areaCopy('transfer.accept.consent', { collective: collectiveName })}
            trackColor={{ true: colors.brand, false: colors.border }}
            thumbColor={colors.surfaceRaised}
          />
        </View>
        <Button
          label={areaCopy('transfer.accept.confirm')}
          fullWidth
          disabled={!agreed || busy}
          loading={busy}
          onPress={onAccept}
        />
        <Button label="Go back" variant="secondary" fullWidth disabled={busy} onPress={onClose} />
      </View>
    </Sheet>
  );
}

export function HostingRequestBanner({
  collectiveId,
  collectiveName,
  hostName,
}: {
  collectiveId: string;
  collectiveName: string;
  hostName: string;
}) {
  const { colors } = useTheme();
  const patch = useCollectiveMembersPatch(collectiveId);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer = (body: Record<string, unknown>) => {
    setError(null);
    patch.mutate(body, {
      onSuccess: () => setReviewing(false),
      onError: (err) => setError(err instanceof ApiError ? err.message : 'That did not go through. Please try again.'),
    });
  };

  return (
    <View style={[styles.banner, { backgroundColor: colors.brandSubtle, borderColor: colors.brand }]}>
      <Text variant="label">{areaCopy('transfer.request.title', { host: hostName, collective: collectiveName })}</Text>
      <Text variant="bodySmall" tone="secondary">
        {areaCopy('notify.hostRequest.body', { collective: collectiveName })}
      </Text>
      {error && !reviewing ? (
        <Text variant="bodySmall" tone="danger">
          {error}
        </Text>
      ) : null}
      <View style={styles.buttonRow}>
        <Button label={areaCopy('transfer.review')} size="sm" disabled={patch.isPending} onPress={() => setReviewing(true)} />
        <Button
          label={areaCopy('transfer.decline')}
          size="sm"
          variant="secondary"
          disabled={patch.isPending}
          onPress={() => answer({ action: 'decline_host' })}
        />
      </View>
      <HostingConsentSheet
        visible={reviewing}
        onClose={() => setReviewing(false)}
        collectiveName={collectiveName}
        hostName={hostName}
        busy={patch.isPending}
        error={error}
        onAccept={() => answer({ action: 'accept_host', consent_version: HOST_TRANSFER_CONSENT_VERSION })}
      />
    </View>
  );
}

export function PausedHostingBanner({
  collectiveId,
  collectiveName,
  formerHostName,
}: {
  collectiveId: string;
  collectiveName: string;
  formerHostName: string;
}) {
  const { colors } = useTheme();
  const patch = useCollectiveMembersPatch(collectiveId);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <View style={[styles.banner, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
      <Text variant="label">{areaCopy('transfer.paused.title', { collective: collectiveName })}</Text>
      <Text variant="bodySmall" tone="secondary">
        {areaCopy('transfer.paused.body', { collective: collectiveName })}
      </Text>
      <View style={styles.buttonRow}>
        <Button label={areaCopy('transfer.paused.takeOver')} size="sm" onPress={() => setReviewing(true)} />
      </View>
      <HostingConsentSheet
        visible={reviewing}
        onClose={() => setReviewing(false)}
        collectiveName={collectiveName}
        hostName={formerHostName}
        busy={patch.isPending}
        error={error}
        onAccept={() => {
          setError(null);
          patch.mutate(
            { action: 'take_over_hosting', consent_version: HOST_TRANSFER_CONSENT_VERSION },
            {
              onSuccess: () => setReviewing(false),
              onError: (err) =>
                setError(err instanceof ApiError ? err.message : 'That did not go through. Please try again.'),
            },
          );
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Ending the collective (web EndCollectiveSection)
// ---------------------------------------------------------------------------

export function EndCollectiveCard({
  collectiveId,
  collectiveName,
  onEnded,
}: {
  collectiveId: string;
  collectiveName: string;
  onEnded: () => void;
}) {
  const { colors } = useTheme();
  const dissolve = useDissolveCollective();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().toLowerCase() === collectiveName.trim().toLowerCase();

  const close = () => {
    if (dissolve.isPending) return;
    setOpen(false);
    setTyped('');
    setError(null);
  };

  return (
    <Card style={[styles.endCard, { borderColor: colors.danger }]}>
      <Text variant="label">{areaCopy('dissolve.sectionTitle')}</Text>
      <Text variant="caption" tone="secondary">
        {areaCopy('dissolve.hint')}
      </Text>
      <Button
        label={areaCopy('dissolve.button', { collective: collectiveName })}
        variant="secondary"
        customColors={{ background: colors.surfaceRaised, text: colors.danger, border: colors.danger }}
        onPress={() => setOpen(true)}
      />
      <Sheet visible={open} onClose={close} keyboardAvoidance="overlay">
        <View style={styles.sheetBody}>
          <Text variant="subheading">{areaCopy('dissolve.title', { collective: collectiveName })}</Text>
          <Text variant="bodySmall" tone="secondary">
            {areaCopy('dissolve.message', { collective: collectiveName })}
          </Text>
          <Input
            label={areaCopy('dissolve.typeToConfirm', { collective: collectiveName })}
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {error ? (
            <Text variant="bodySmall" tone="danger">
              {error}
            </Text>
          ) : null}
          <Button
            label={areaCopy('dissolve.button', { collective: collectiveName })}
            variant="danger"
            fullWidth
            disabled={!matches || dissolve.isPending}
            loading={dissolve.isPending}
            onPress={() =>
              dissolve.mutate(collectiveId, {
                onSuccess: () => {
                  setOpen(false);
                  onEnded();
                },
                onError: (err) =>
                  setError(err instanceof ApiError ? err.message : 'Could not end the collective. Please try again.'),
              })
            }
          />
          <Button label="Go back" variant="secondary" fullWidth disabled={dissolve.isPending} onPress={close} />
        </View>
      </Sheet>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  todo: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: spacing.md,
    gap: spacing.sm,
  },
  todoRow: { gap: spacing.xxs },
  cards: { gap: spacing.sm },
  venueCard: { gap: spacing.xs },
  banner: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: spacing.md,
    gap: spacing.sm,
  },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sheetBody: { gap: spacing.md },
  endCard: { gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth },
});
