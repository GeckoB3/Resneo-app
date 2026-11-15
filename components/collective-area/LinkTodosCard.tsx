/**
 * "Venues joining" (web `CollectiveLinkTodos`, 2026-10-28): the one case where a venue joining the
 * collective is held up by this venue.
 *
 * Accepting an invitation links the joining venue with every venue already in and joins it, in one
 * step (owner, 2026-10-28), so venues in the collective have nothing to do when another is invited.
 * Except one thing nobody else can decide: a link this venue already has with the invited venue,
 * in force with less than full access both ways, which it set up that way on purpose. Joining never
 * widens that, so it is shown here, at the top of Manage Collective, with "Change it in Linked
 * Accounts". Nothing else shows, and the card does not appear when there is nothing like that.
 * Shown to the host and to members alike.
 *
 * Shared client lists (plan P7, parity table): "What needs you" also carries the request to share
 * ("Aura asked your collective to share clients.", Share now / Not now) and the clients waiting to
 * be checked, with Check them. The screen works out the rows and what each button does.
 */
import { useRouter, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { clientSharingCopy, formatClientCount } from '@/lib/collective-area/client-sharing-copy';
import type { ClientSharingTodos } from '@/lib/collective-area/client-sharing-lines';
import { areaCopy } from '@/lib/collective-area/copy';
import { actionableLinkTodos, linkTodoText } from '@/lib/collective-area/invite-links';
import { useLinkTodos } from '@/lib/queries/useCollectiveLinks';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** The client-sharing rows and what their buttons do. */
export interface ClientSharingTodoActions extends ClientSharingTodos {
  onShare: () => void;
  onNotNow: () => void;
  onCheck: () => void;
  sharing: boolean;
  dismissing: boolean;
}

export function LinkTodosCard({ clientSharing = null }: { clientSharing?: ClientSharingTodoActions | null }) {
  const { colors } = useTheme();
  const router = useRouter();
  const query = useLinkTodos();
  const todos = actionableLinkTodos(query.data);

  // Nothing to show is the safe answer on a failed read: the invited venue's own sheet says what is in the way.
  if (todos.length === 0 && !clientSharing) return null;

  const sharingCard = clientSharing ? (
    <View
      accessibilityLabel={areaCopy('ov.todo.heading')}
      testID="client-sharing-todos"
      style={[styles.card, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}
    >
      <Text variant="label">{areaCopy('ov.todo.heading')}</Text>
      {clientSharing.askedBy ? (
        <View style={styles.row}>
          <Text variant="bodySmall">{clientSharingCopy('cs.todo.asked', { venue: clientSharing.askedBy })}</Text>
          <View style={styles.buttons}>
            <Button
              label={clientSharingCopy('cs.todo.share')}
              size="sm"
              loading={clientSharing.sharing}
              disabled={clientSharing.sharing || clientSharing.dismissing}
              onPress={clientSharing.onShare}
            />
            <Button
              label={clientSharingCopy('cs.todo.notNow')}
              variant="secondary"
              size="sm"
              loading={clientSharing.dismissing}
              disabled={clientSharing.sharing || clientSharing.dismissing}
              onPress={clientSharing.onNotNow}
            />
          </View>
        </View>
      ) : null}
      {clientSharing.toCheck > 0 ? (
        <View style={styles.row}>
          <Text variant="bodySmall">
            {clientSharing.toCheck === 1
              ? clientSharingCopy('cs.todo.checkOne')
              : clientSharingCopy('cs.todo.check', { count: formatClientCount(clientSharing.toCheck) })}
          </Text>
          <Button
            label={clientSharingCopy('cs.todo.open')}
            variant="secondary"
            size="sm"
            style={styles.action}
            onPress={clientSharing.onCheck}
          />
        </View>
      ) : null}
    </View>
  ) : null;

  if (todos.length === 0) return sharingCard;

  const linkCard = (
    <View
      accessibilityLabel={areaCopy('ov.linkTodo.heading')}
      style={[styles.card, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}
    >
      <Text variant="label">{areaCopy('ov.linkTodo.heading')}</Text>
      {todos.map((todo) => (
        <View key={`${todo.collective_id}:${todo.venue_id}`} style={styles.row}>
          <Text variant="bodySmall">{linkTodoText(todo)}</Text>
          <Button
            label={areaCopy('ov.linkTodo.change')}
            variant="secondary"
            size="sm"
            style={styles.action}
            accessibilityLabel={`${areaCopy('ov.linkTodo.change')}: ${todo.venue_name}`}
            onPress={() => router.push('/linked-venues' as Href)}
          />
        </View>
      ))}
    </View>
  );

  return sharingCard ? (
    <View style={styles.stack}>
      {sharingCard}
      {linkCard}
    </View>
  ) : (
    linkCard
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  row: { gap: spacing.xs },
  action: { alignSelf: 'flex-start' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stack: { gap: spacing.md },
});
