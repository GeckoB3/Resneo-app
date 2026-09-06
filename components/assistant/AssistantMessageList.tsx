import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { ASSISTANT_COPY } from '@/lib/assistant/copy';
import type { AssistantChatMessage } from '@/lib/assistant/useAssistantChat';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

import { AssistantMarkdown } from './AssistantMarkdown';

export interface AssistantMessageListProps {
  messages: AssistantChatMessage[];
  onRate: (id: string, rating: 1 | -1, comment?: string) => void;
  onSendToSupport: (upToMessageId: string) => void;
  onPressLink: (href: string) => void;
}

/**
 * The conversation: the question on the right, the answer on the left, and
 * under a finished answer the two things the web puts there — was this helpful,
 * and a way to hand the whole thing to Support (web `AssistantMessageList`).
 */
export function AssistantMessageList({
  messages,
  onRate,
  onSendToSupport,
  onPressLink,
}: AssistantMessageListProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.list}>
      {messages.map((message) =>
        message.role === 'user' ? (
          <View key={message.id} style={styles.userRow}>
            <View style={[styles.userBubble, { backgroundColor: colors.brand }]}>
              <Text variant="body" color={colors.onBrand}>
                {message.content}
              </Text>
            </View>
          </View>
        ) : (
          <AssistantTurn
            key={message.id}
            message={message}
            onRate={onRate}
            onSendToSupport={onSendToSupport}
            onPressLink={onPressLink}
          />
        ),
      )}
    </View>
  );
}

function AssistantTurn({
  message,
  onRate,
  onSendToSupport,
  onPressLink,
}: {
  message: AssistantChatMessage;
  onRate: AssistantMessageListProps['onRate'];
  onSendToSupport: AssistantMessageListProps['onSendToSupport'];
  onPressLink: AssistantMessageListProps['onPressLink'];
}) {
  const { colors } = useTheme();
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState('');
  const finished = !message.pending && !message.error;

  return (
    <View style={styles.assistantRow}>
      <View
        style={[
          styles.assistantBubble,
          { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
        ]}>
        {message.content ? (
          <AssistantMarkdown markdown={message.content} onPressLink={onPressLink} />
        ) : message.pending ? (
          <Text variant="body" tone="muted" accessibilityLiveRegion="polite">
            {`${ASSISTANT_COPY.thinking}…`}
          </Text>
        ) : null}

        {message.error ? (
          <Text variant="bodySmall" tone="danger" style={styles.spaced}>
            {message.error}
          </Text>
        ) : null}
        {message.stopped && message.content ? (
          <Text variant="caption" tone="muted" style={styles.spaced}>
            {ASSISTANT_COPY.stopped}
          </Text>
        ) : null}

        {finished && message.content ? (
          <View style={[styles.actions, { borderTopColor: colors.border }]}>
            {message.serverId ? (
              message.rating ? (
                <Text variant="caption" tone="muted">
                  {ASSISTANT_COPY.feedbackThanks}
                </Text>
              ) : (
                <View style={styles.feedbackRow}>
                  <Text variant="caption" tone="muted">
                    {ASSISTANT_COPY.feedbackPrompt}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Yes, this was helpful"
                    hitSlop={8}
                    onPress={() => onRate(message.id, 1)}>
                    <Text variant="caption" tone="brand">
                      {ASSISTANT_COPY.feedbackYes}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="No, this was not helpful"
                    hitSlop={8}
                    onPress={() => setCommentOpen(true)}>
                    <Text variant="caption" tone="brand">
                      {ASSISTANT_COPY.feedbackNo}
                    </Text>
                  </Pressable>
                </View>
              )
            ) : null}
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              style={styles.supportAction}
              onPress={() => onSendToSupport(message.id)}>
              <Text variant="caption" tone="brand">
                {ASSISTANT_COPY.sendToSupport}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {commentOpen && !message.rating ? (
          <View style={styles.commentBox}>
            <Input
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={2}
              maxLength={500}
              placeholder={ASSISTANT_COPY.feedbackCommentPlaceholder}
              accessibilityLabel="Feedback comment"
            />
            <View style={styles.commentActions}>
              <Button
                label="Skip"
                variant="ghost"
                size="sm"
                onPress={() => {
                  onRate(message.id, -1);
                  setCommentOpen(false);
                }}
              />
              <Button
                label={ASSISTANT_COPY.feedbackCommentSend}
                size="sm"
                onPress={() => {
                  onRate(message.id, -1, comment);
                  setCommentOpen(false);
                }}
              />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.base,
  },
  userRow: {
    alignItems: 'flex-end',
  },
  userBubble: {
    maxWidth: '88%',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.sm,
  },
  assistantRow: {
    alignItems: 'flex-start',
  },
  assistantBubble: {
    maxWidth: '96%',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderBottomLeftRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  spaced: {
    marginTop: spacing.sm,
  },
  actions: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  supportAction: {
    marginLeft: 'auto',
  },
  commentBox: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  commentActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
});
