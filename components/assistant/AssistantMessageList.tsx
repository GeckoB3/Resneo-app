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
import { ThinkingDots } from './ThinkingDots';

/**
 * "Yes" and "No" are two-letter captions. Without slop they are a ~20pt target,
 * well under the 44pt minimum — and a tablet is held further from the eye and
 * tapped with a thumb at arm's length, so this is where it shows first.
 */
const HIT_SLOP = { top: 12, bottom: 12, left: 10, right: 10 };

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
        testID="assistant-answer"
        style={[
          styles.assistantBubble,
          { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
        ]}>
        {message.content ? (
          <AssistantMarkdown markdown={message.content} onPressLink={onPressLink} />
        ) : message.pending ? (
          // Nothing has arrived yet: the dots are what say the app is still
          // listening, as they do on the web.
          <View style={styles.thinking}>
            <ThinkingDots />
            <Text variant="body" tone="muted" accessibilityLiveRegion="polite">
              {`${ASSISTANT_COPY.thinking}…`}
            </Text>
          </View>
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
            {/* Always rendered, even when there is nothing to rate yet, so the
                support link keeps its place at the end of the row instead of
                sliding under the answer when the rating half disappears. */}
            <View style={styles.feedbackRow}>
              {message.serverId ? (
                message.rating ? (
                  <Text variant="caption" tone="muted">
                    {ASSISTANT_COPY.feedbackThanks}
                  </Text>
                ) : (
                  <>
                    <Text variant="caption" tone="muted">
                      {ASSISTANT_COPY.feedbackPrompt}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Yes, this was helpful"
                      hitSlop={HIT_SLOP}
                      onPress={() => onRate(message.id, 1)}>
                      <Text variant="caption" tone="brand">
                        {ASSISTANT_COPY.feedbackYes}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="No, this was not helpful"
                      hitSlop={HIT_SLOP}
                      onPress={() => setCommentOpen(true)}>
                      <Text variant="caption" tone="brand">
                        {ASSISTANT_COPY.feedbackNo}
                      </Text>
                    </Pressable>
                  </>
                )
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              hitSlop={HIT_SLOP}
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
    alignItems: 'stretch',
  },
  assistantBubble: {
    // Deliberately NOT shrink-to-fit. An answer is paragraphs and numbered
    // steps, and a step's text is `flex: 1` inside its row — which contributes
    // nothing to an intrinsic width — so a bubble sized by its content collapses
    // to the longest plain line it happens to contain. On a phone that line is
    // usually wider than the screen, so the bubble filled it and nobody saw the
    // bug; on a tablet there is room to spare, so the same answer drew itself in
    // a phone-width column, and (on the native layout engine, which measured the
    // text at one width and drew it at another) the answer ran over the feedback
    // row underneath it. A stretched bubble has a definite width before the text
    // is measured, which is what makes the height right.
    alignSelf: 'stretch',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderBottomLeftRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  thinking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    rowGap: spacing.sm,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    // Shrinks before it overflows: on a narrow phone "Was this helpful? Yes No"
    // and "Send this to support" together are wider than the bubble, and this
    // is what lets the pair wrap instead of running off the edge.
    flexShrink: 1,
    columnGap: spacing.sm,
    rowGap: spacing.xs,
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
