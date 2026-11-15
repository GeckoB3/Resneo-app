/**
 * Shared client lists on the Clients list (web `ClientSharingBanners`; plan §1A.2 steps 0 and 5,
 * mockup board 4): the once-only "Turn it on" nudge for an owner or admin whose collective offers
 * it, then one "N clients to check" banner when matches or changes wait (the web's order). Nothing
 * on the rows.
 */
import { useRouter, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { clientSharingCopy, formatClientCount } from '@/lib/collective-area/client-sharing-copy';
import { useClientSharingSummary, useDismissClientSharing } from '@/lib/queries/useClientSharing';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export function ClientSharingBanners() {
  const { colors } = useTheme();
  const router = useRouter();
  const summary = useClientSharingSummary();
  const dismiss = useDismissClientSharing(summary.data?.collectiveId ?? null);
  const s = summary.data;
  // A failed read or an older server shows nothing: the list itself is unaffected.
  if (!s || !s.collectiveId) return null;

  const showBanner = s.canManage && s.toCheck > 0;
  if (!s.showNudge && !showBanner) return null;

  return (
    <View style={styles.wrap}>
      {s.showNudge ? (
        <View style={[styles.card, { backgroundColor: colors.accentSubtle, borderColor: colors.accent }]}>
          <Text variant="bodySmall">{clientSharingCopy('cs.contact.nudge')}</Text>
          <View style={styles.row}>
            <Button
              label={clientSharingCopy('cs.contact.nudgeAction')}
              size="sm"
              style={styles.flex1}
              onPress={() => router.push('/collective-area?tab=clients' as Href)}
            />
            <Button
              label={clientSharingCopy('cs.contact.nudgeDismiss')}
              size="sm"
              variant="secondary"
              style={styles.flex1}
              loading={dismiss.isPending}
              onPress={() => dismiss.mutate('nudge')}
            />
          </View>
        </View>
      ) : null}
      {showBanner ? (
        <View style={[styles.card, styles.row, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
          <Text variant="bodySmall" style={styles.flex1}>
            {s.toCheck === 1
              ? clientSharingCopy('cs.contact.bannerOne')
              : clientSharingCopy('cs.contact.banner', { count: formatClientCount(s.toCheck) })}
          </Text>
          <Button
            label={clientSharingCopy('cs.todo.open')}
            size="sm"
            variant="secondary"
            onPress={() => router.push(`/client/check?collective=${s.collectiveId}` as Href)}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex1: { flex: 1 },
});
