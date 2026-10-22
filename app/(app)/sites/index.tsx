import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmPanel } from '@/components/ui/ConfirmPanel';
import { ErrorState } from '@/components/ui/ErrorState';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError, apiErrorCode } from '@/lib/api/client';
import { hapticTap } from '@/lib/haptics';
import { useAcceptSiteInvite, useDeclineSiteInvite, useMeSites } from '@/lib/queries/useMeSites';
import { getActingVenueId } from '@/lib/sites/active-site';
import { SITES_COPY, siteRoleLabel } from '@/lib/sites/sites';
import { useSwitchSite } from '@/lib/sites/useSwitchSite';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { MePendingInvite, MeSite } from '@/types/sites';

/**
 * The site picker (web roles plan §6.2c, §6.3; copy from Appendix C "Sites"). Reached from the
 * More tab's header, and offered once after signing in (`?welcome=1`) to someone with more than
 * one site or an invite waiting.
 *
 * Lists the person's own sites only (a site never learns about another, §6.2d). Choosing one
 * switches the whole app to it and opens its Today screen. Invitations offer Join and Decline; an
 * invite to be a business's owner can only be taken up through ResNeo support. Adding a site is on
 * the web only (UR31), so it is plain text here, with no link.
 */
export default function SitesScreen() {
  const params = useLocalSearchParams<{ welcome?: string }>();
  const welcome = params.welcome === '1';
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const me = useMeSites();
  const accept = useAcceptSiteInvite();
  const decline = useDeclineSiteInvite();
  const switchSite = useSwitchSite();

  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDecline, setConfirmDecline] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ message: string; passwordFirst: boolean } | null>(null);

  const header = <Stack.Screen options={{ headerShown: true, title: SITES_COPY.switchSite }} />;

  if (me.isLoading) {
    return (
      <Screen>
        {header}
        <ListSkeleton rows={3} />
      </Screen>
    );
  }
  if (me.isError || !me.data) {
    return (
      <Screen>
        {header}
        <ErrorState
          message={me.error instanceof ApiError ? me.error.message : SITES_COPY.loadFailed}
          onRetry={() => void me.refetch()}
        />
      </Screen>
    );
  }

  const { sites, pending_invites: invites, overview_eligible: overviewEligible } = me.data;
  const currentId = me.data.active_venue_id ?? getActingVenueId();
  const ownsASite = sites.some((s) => s.is_owner);

  const open = async (site: MeSite) => {
    hapticTap();
    setBusy(site.venue_id);
    setProblem(null);
    try {
      await switchSite(site.venue_id);
    } catch {
      setProblem({ message: SITES_COPY.switchFailed, passwordFirst: false });
    } finally {
      setBusy(null);
    }
  };

  const join = async (invite: MePendingInvite) => {
    setBusy(invite.staff_id);
    setProblem(null);
    try {
      await accept.mutateAsync(invite.staff_id);
      toast.success(SITES_COPY.joined(invite.venue_name));
    } catch (e) {
      setProblem({
        message: e instanceof ApiError ? e.message : SITES_COPY.joinFailed,
        passwordFirst: apiErrorCode(e) === 'SET_OWN_PASSWORD_FIRST',
      });
      if (apiErrorCode(e) === 'INVITE_NOT_FOUND') void me.refetch();
    } finally {
      setBusy(null);
    }
  };

  const confirmTheDecline = async (invite: MePendingInvite) => {
    setBusy(invite.staff_id);
    setProblem(null);
    try {
      await decline.mutateAsync(invite.staff_id);
    } catch (e) {
      setProblem({ message: e instanceof ApiError ? e.message : SITES_COPY.declineFailed, passwordFirst: false });
    } finally {
      setConfirmDecline(null);
      setBusy(null);
    }
  };

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={me.isRefetching} onRefresh={() => void me.refetch()} />}>
        {welcome && sites.length > 1 ? <Text variant="body">{SITES_COPY.chooseSite}</Text> : null}

        {problem ? (
          <View
            accessibilityRole="alert"
            style={[styles.problem, { backgroundColor: colors.dangerSurface, borderColor: colors.danger }]}>
            <Text variant="bodySmall" color={colors.danger}>
              {problem.message}
            </Text>
            {problem.passwordFirst ? (
              <Button
                label={SITES_COPY.choosePassword}
                variant="secondary"
                size="sm"
                onPress={() => router.push('/set-password' as Href)}
              />
            ) : null}
          </View>
        ) : null}

        {invites.length > 0 ? (
          <View style={styles.section}>
            {invites.map((invite) => (
              <Card key={invite.staff_id} style={styles.invite}>
                {invite.is_owner ? (
                  <Text variant="bodySmall">{SITES_COPY.ownerInvite}</Text>
                ) : (
                  <>
                    <Text variant="bodyMedium">{SITES_COPY.invite(invite.venue_name)}</Text>
                    {confirmDecline === invite.staff_id ? (
                      <ConfirmPanel
                        title={SITES_COPY.declineConfirm}
                        confirmLabel={SITES_COPY.decline}
                        cancelLabel={SITES_COPY.keepInvite}
                        destructive
                        loading={busy === invite.staff_id}
                        onConfirm={() => void confirmTheDecline(invite)}
                        onCancel={() => setConfirmDecline(null)}
                      />
                    ) : (
                      <View style={styles.inviteActions}>
                        <Button
                          label={SITES_COPY.join}
                          size="sm"
                          loading={busy === invite.staff_id}
                          disabled={busy !== null}
                          onPress={() => void join(invite)}
                          accessibilityLabel={`Join ${invite.venue_name}`}
                        />
                        <Button
                          label={SITES_COPY.decline}
                          variant="secondary"
                          size="sm"
                          disabled={busy !== null}
                          onPress={() => setConfirmDecline(invite.staff_id)}
                          accessibilityLabel={`Decline ${invite.venue_name}`}
                        />
                      </View>
                    )}
                  </>
                )}
              </Card>
            ))}
          </View>
        ) : null}

        {sites.length > 0 ? (
          <View style={styles.section}>
            <Text variant="overline" tone="muted">
              {SITES_COPY.switchSite}
            </Text>
            <Card padded={false}>
              {sites.map((site, index) => {
                const current = site.venue_id === currentId;
                return (
                  <PressableScale
                    key={site.venue_id}
                    onPress={() => void open(site)}
                    disabled={busy !== null}
                    accessibilityRole="button"
                    accessibilityLabel={current ? `${site.name}, ${SITES_COPY.currentSite}` : `Switch to ${site.name}`}
                    style={[
                      styles.siteRow,
                      index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                    ]}>
                    <View style={styles.siteText}>
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {site.name}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {siteRoleLabel(site)}
                      </Text>
                    </View>
                    {current ? <Badge label={SITES_COPY.currentSite} tone="brand" /> : null}
                    <SymbolView
                      name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                      tintColor={colors.textMuted}
                      size={14}
                    />
                  </PressableScale>
                );
              })}
            </Card>
          </View>
        ) : null}

        {overviewEligible ? (
          <Card padded={false}>
            <PressableScale
              onPress={() => router.push('/sites/overview' as Href)}
              accessibilityRole="button"
              accessibilityLabel={SITES_COPY.allSites}
              style={styles.siteRow}>
              <SymbolView
                name={{ ios: 'square.grid.2x2', android: 'grid_view', web: 'grid_view' }}
                tintColor={colors.brand}
                size={18}
              />
              <View style={styles.siteText}>
                <Text variant="bodyMedium">{SITES_COPY.allSites}</Text>
              </View>
              <SymbolView
                name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                tintColor={colors.textMuted}
                size={14}
              />
            </PressableScale>
          </Card>
        ) : null}

        {ownsASite ? (
          <Text variant="bodySmall" tone="muted">
            {SITES_COPY.addSiteInApp}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  section: { gap: spacing.sm },
  invite: { gap: spacing.md },
  inviteActions: { flexDirection: 'row', gap: spacing.sm },
  siteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  siteText: { flex: 1, minWidth: 0, gap: 2 },
  problem: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
});
