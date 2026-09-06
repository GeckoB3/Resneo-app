import { SymbolView } from 'expo-symbols';
import { Stack, useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useRef } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AssistantComposer } from '@/components/assistant/AssistantComposer';
import { AssistantMessageList } from '@/components/assistant/AssistantMessageList';
import { ContentColumn } from '@/components/ui/ContentColumn';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useKeyboardInset } from '@/components/ui/useKeyboardInset';
import { ASSISTANT_COPY } from '@/lib/assistant/copy';
import { writeHandoff } from '@/lib/assistant/handoff';
import { assistantLinkUrl, isVideoLink } from '@/lib/assistant/links';
import { useAssistantChat } from '@/lib/assistant/useAssistantChat';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import { useToast } from '@/providers/ToastProvider';

/**
 * Ask ResNeo — the app's half of the web's help assistant drawer
 * (`src/components/assistant/AssistantSheet.tsx`). Same conversation, same
 * server: `POST /api/venue/assistant` answers from the help centre articles,
 * made specific with this venue's plan and settings and the caller's role, and
 * told by the Bearer token that it is talking to somebody on the app, so the
 * steps it gives are the app's steps.
 *
 * A drawer on the web is a screen here: a chat with a keyboard has no business
 * inside a sheet, and this is reached from More rather than from a launcher
 * pinned to the chrome.
 *
 * It cannot change anything. The assistant has no tools and no write path
 * beyond its own log, so the worst it can do is answer badly, which is what the
 * thumbs and the disclaimer are for.
 */
export default function AssistantScreen() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset(insets.bottom);
  const { state, send, stop, reset, rate } = useAssistantChat();
  const scrollRef = useRef<ScrollView>(null);
  const streaming = state.status === 'streaming';

  // The composer sits on the bottom safe area and rises with the keyboard. The
  // screen keeps `bottomInset={false}` so this is the only thing reserving it.
  const footerStyle = useAnimatedStyle(() => ({
    paddingBottom: spacing.base + insets.bottom + keyboardInset.value,
  }));

  const openLink = useCallback(
    (href: string) => {
      const url = assistantLinkUrl(href);
      // A link we do not open should never have been tappable; nothing to say.
      if (!url) return;
      const fallback = () =>
        Linking.openURL(url).catch(() => toast.error('Could not open the link.'));
      // A video goes to the YouTube app when there is one; our own pages open
      // in the in-app browser, as every other web link in the app does.
      if (isVideoLink(url)) {
        void Linking.openURL(url).catch(fallback);
        return;
      }
      void WebBrowser.openBrowserAsync(url).catch(fallback);
    },
    [toast],
  );

  const sendToSupport = useCallback(
    (upToMessageId: string) => {
      const index = state.messages.findIndex((m) => m.id === upToMessageId);
      const turns = (index >= 0 ? state.messages.slice(0, index + 1) : state.messages)
        .filter((m) => !m.pending && m.content.trim())
        .map((m) => ({ role: m.role, content: m.content }));
      writeHandoff(turns);
      router.push('/support' as Href);
    },
    [router, state.messages],
  );

  return (
    <Screen scroll={false} padded={false} bottomInset={false}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: ASSISTANT_COPY.title,
          headerRight: () =>
            state.messages.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={ASSISTANT_COPY.newConversation}
                hitSlop={8}
                onPress={reset}>
                <Text variant="label" tone="brand">
                  {ASSISTANT_COPY.newConversation}
                </Text>
              </Pressable>
            ) : null,
        }}
      />

      {/* Kept out of the scroll view on purpose: "please don't include client
          details" has to be on screen while the person is typing, not two
          answers up. */}
      <View style={[styles.intro, { borderBottomColor: colors.border }]}>
        <ContentColumn>
          <Text variant="caption" tone="muted">
            {ASSISTANT_COPY.description}
          </Text>
        </ContentColumn>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {/* The conversation is prose. A tablet has room to run it the full
            width of the window, and it must not: the column is capped and
            centred so a line of an answer stays as readable as it is on a
            phone, and the rules that hold the bubble together (the answer
            stretches, the question hugs the right) go on meaning the same
            thing at every width. */}
        <ContentColumn style={styles.column}>
          {state.messages.length > 0 ? (
            <AssistantMessageList
              messages={state.messages}
              onRate={rate}
              onSendToSupport={sendToSupport}
              onPressLink={openLink}
            />
          ) : (
            <EmptyState
              title={ASSISTANT_COPY.emptyTitle}
              message={ASSISTANT_COPY.emptyBody}
              icon={
                <SymbolView
                  name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }}
                  tintColor={colors.brand}
                  size={34}
                />
              }
            />
          )}
        </ContentColumn>
      </ScrollView>

      <Animated.View
        style={[styles.footer, { borderTopColor: colors.border }, footerStyle]}>
        <ContentColumn style={styles.footerColumn}>
          {state.notice ? (
            <View
              style={[
                styles.notice,
                { backgroundColor: colors.warningSurface, borderColor: colors.warning },
              ]}>
              <Text variant="bodySmall" color={colors.warning}>
                {state.notice}
              </Text>
            </View>
          ) : null}

          <AssistantComposer
            streaming={streaming}
            disabled={state.blocked === 'daily_cap' || state.blocked === 'unavailable'}
            onSend={send}
            onStop={stop}
          />

          <Text variant="caption" tone="muted">
            {ASSISTANT_COPY.disclaimer}
          </Text>
        </ContentColumn>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  intro: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.base,
    gap: spacing.base,
  },
  // Grows with the scroll content so the empty state (which is `flex: 1`) still
  // centres itself in the whole screen rather than collapsing to its text.
  column: {
    flexGrow: 1,
  },
  footerColumn: {
    gap: spacing.sm,
  },
  footer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  notice: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
