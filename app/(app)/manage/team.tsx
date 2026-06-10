import { Stack } from 'expo-router';
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { getApiUrl } from '@/lib/env';
import { useStaffList } from '@/lib/queries/useStaffList';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';

/** Team logins & roles — read-only list (invites/permissions on web, admin only). */
export default function TeamScreen() {
  const { venue } = useVenueContext();
  const isAdmin = venue?.current_user_role === 'admin';
  const query = useStaffList(isAdmin);

  const openWebStaff = () => {
    const url = `${getApiUrl()}/dashboard/settings`;
    void Linking.openURL(url).catch(() => Alert.alert('Could not open browser', url));
  };

  const header = <Stack.Screen options={{ title: 'Team' }} />;

  if (!isAdmin) {
    return (
      <Screen>
        {header}
        <ErrorState message="The team list is only available to venue admins." />
      </Screen>
    );
  }

  const members = query.data?.staff ?? [];

  return (
    <Screen scroll={false} padded={false}>
      {header}
      {query.isLoading ? (
        <ListSkeleton />
      ) : query.isError ? (
        <View style={styles.stateWrap}>
          <ErrorState
            message={query.error instanceof ApiError ? query.error.message : 'Could not load the team.'}
            onRetry={() => void query.refetch()}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
          }>
          {members.length === 0 ? (
            <EmptyState title="No team members" message="Invite staff from the web dashboard." />
          ) : (
            <Card padded={false}>
              {members.map((member, index) => (
                <View
                  key={member.id}
                  style={[styles.row, index < members.length - 1 ? styles.rowDivider : null]}>
                  <Avatar name={member.name ?? member.email ?? 'Staff'} size={40} />
                  <View style={styles.rowText}>
                    <Text variant="bodyMedium" numberOfLines={1}>
                      {member.name ?? member.email ?? 'Staff member'}
                    </Text>
                    {member.email ? (
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {member.email}
                      </Text>
                    ) : null}
                  </View>
                  <Badge
                    label={member.role === 'admin' ? 'Admin' : 'Staff'}
                    tone={member.role === 'admin' ? 'brand' : 'neutral'}
                  />
                </View>
              ))}
            </Card>
          )}
          <Button label="Invite & manage on web" variant="secondary" fullWidth onPress={openWebStaff} />
          <View style={styles.spacer} />
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148, 163, 184, 0.35)',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  spacer: {
    height: spacing.xl,
  },
});
