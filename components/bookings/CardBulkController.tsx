/**
 * Confirm without a card and Send card requests, for many bookings at once (web
 * Docs/card-on-file-plan.md §4.16, §6.4): the question first, then the server's words, with
 * "Undo" for 5 minutes after Confirm without a card.
 *
 * The parent hands over a request (the action, the selection and the count the screen showed).
 * "Select all" sends the filter with that count; when the server finds a different number
 * (409 CARD_COUNT_CHANGED) the question is asked again with the new number, never acted on
 * silently. The result message stays until dismissed and is announced to screen readers; Undo
 * restores each booking's exact earlier state and sends nothing.
 */
import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Text } from '@/components/ui/Text';
import {
  CONFIRM_WITHOUT_CARD_UNDO_MS,
  bookingsCountLabel,
  confirmWithoutCardQuestion,
  sendCardRequestsQuestion,
} from '@/lib/booking/card-hold';
import { undoDeadlineMs } from '@/lib/booking/card-list';
import {
  cardCountChangedFrom,
  useConfirmWithoutCard,
  usePreviewCardRequests,
  useSendCardRequests,
  useUndoConfirmWithoutCard,
  type CardBulkSelection,
  type CardRequestsPreview,
} from '@/lib/queries/useCardsOnFile';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export type CardBulkAction = 'confirm_without_card' | 'send_card_requests';

export interface CardBulkRequest {
  action: CardBulkAction;
  selection: CardBulkSelection;
  /** The number of bookings the question names. */
  count: number;
}

type Result = {
  message: string;
  tone: 'default' | 'danger';
  actionIds: string[];
  undoUntilMs: number | null;
};

function withCount(selection: CardBulkSelection, count: number): CardBulkSelection {
  return 'filter' in selection ? { ...selection, expectedCount: count } : selection;
}

export function CardBulkController({
  request,
  onDone,
  onCancel,
  now = () => Date.now(),
}: {
  request: CardBulkRequest | null;
  /** The action ran (the selection can be cleared). */
  onDone: () => void;
  /** The question was dismissed. */
  onCancel: () => void;
  /** For tests. */
  now?: () => number;
}) {
  const { colors } = useTheme();
  const confirmWithout = useConfirmWithoutCard();
  const sendRequests = useSendCardRequests();
  const undo = useUndoConfirmWithoutCard();
  // A changed count replaces the request the parent sent, for that request only.
  const [override, setOverride] = useState<{ base: CardBulkRequest; asked: CardBulkRequest; note: string } | null>(
    null,
  );
  const asked = override && override.base === request ? override.asked : request;
  const countChanged = override && override.base === request ? override.note : null;
  const [result, setResult] = useState<Result | null>(null);
  const [, setTick] = useState(0);

  // Send card requests: the counts first, before anything is sent ("This sends to 12 clients:
  // 12 emails and 9 texts.", plan §4.16). Asked again for a changed count.
  const previewMutate = usePreviewCardRequests().mutateAsync;
  const doneAfterOlderServerSent = useEffectEvent(() => onDone());
  /** The counts for one question: `summary` null when they could not be had. None yet: counting. */
  const [preview, setPreview] = useState<{ for: CardBulkRequest; summary: CardRequestsPreview | null } | null>(null);
  useEffect(() => {
    if (!asked || asked.action !== 'send_card_requests' || asked.count === 0) return;
    let live = true;
    previewMutate(asked.selection)
      .then((out) => {
        if (!live) return;
        if (!out.supported) {
          // A server older than the preview sent instead: say what went, and close the question.
          setResult({ message: out.message, tone: 'default', actionIds: [], undoUntilMs: null });
          setPreview(null);
          setOverride(null);
          doneAfterOlderServerSent();
          return;
        }
        setPreview({ for: asked, summary: out });
      })
      .catch((error: unknown) => {
        if (!live) return;
        const count = cardCountChangedFrom(error);
        if (count != null && request && count !== asked.count) {
          setOverride({
            base: request,
            asked: { ...asked, count, selection: withCount(asked.selection, count) },
            note: `The number of bookings has changed to ${count}. Please confirm again.`,
          });
          return;
        }
        // No counts: sending still works and says what it did.
        setPreview({ for: asked, summary: null });
      });
    return () => {
      live = false;
    };
  }, [asked, request, previewMutate]);
  const previewNow = preview && preview.for === asked ? preview : null;
  const previewLine =
    asked?.action !== 'send_card_requests' || asked.count === 0
      ? null
      : previewNow
        ? (previewNow.summary?.message ?? null)
        : 'Counting the clients...';
  // Nothing a send would do: no client to send to and no booking to put back to Waiting for card.
  const nothingToSend =
    previewNow?.summary != null && previewNow.summary.clients === 0 && previewNow.summary.reopened === 0;

  // Hide Undo once its window has passed.
  const undoUntilMs = result?.undoUntilMs ?? null;
  useEffect(() => {
    if (undoUntilMs == null) return;
    const wait = undoUntilMs - now();
    if (wait <= 0) return;
    const timer = setTimeout(() => setTick((t) => t + 1), wait + 50);
    return () => clearTimeout(timer);
  }, [undoUntilMs, now]);

  const busy = confirmWithout.isPending || sendRequests.isPending;

  const run = useCallback(async () => {
    if (!asked) return;
    try {
      if (asked.action === 'confirm_without_card') {
        const out = await confirmWithout.mutateAsync(asked.selection);
        setResult({
          message: out.message,
          tone: 'default',
          actionIds: out.actionIds,
          undoUntilMs:
            out.actionIds.length > 0 ? undoDeadlineMs(out.undoUntil, now(), CONFIRM_WITHOUT_CARD_UNDO_MS) : null,
        });
      } else {
        const out = await sendRequests.mutateAsync(asked.selection);
        setResult({ message: out.message, tone: 'default', actionIds: [], undoUntilMs: null });
      }
      setOverride(null);
      onDone();
    } catch (error) {
      const count = cardCountChangedFrom(error);
      if (count != null && request) {
        setOverride({
          base: request,
          asked: { ...asked, count, selection: withCount(asked.selection, count) },
          note: `The number of bookings has changed to ${count}. Please confirm again.`,
        });
        return;
      }
      setResult({
        message: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
        tone: 'danger',
        actionIds: [],
        undoUntilMs: null,
      });
      onDone();
    }
  }, [asked, request, confirmWithout, sendRequests, now, onDone]);

  const runUndo = useCallback(async () => {
    if (!result || result.actionIds.length === 0) return;
    try {
      const out = await undo.mutateAsync(result.actionIds);
      const kept = out.kept > 0 ? ` ${out.kept} could not be undone because a card was added or they changed since.` : '';
      setResult({
        message: `Undone. ${bookingsCountLabel(out.restored)} ${out.restored === 1 ? 'is' : 'are'} back as they were.${kept}`,
        tone: 'default',
        actionIds: [],
        undoUntilMs: null,
      });
    } catch (error) {
      setResult({
        ...result,
        message: error instanceof Error ? error.message : 'Undo did not work. Please try again.',
        tone: 'danger',
        actionIds: [],
        undoUntilMs: null,
      });
    }
  }, [result, undo]);

  const question = asked
    ? asked.action === 'confirm_without_card'
      ? confirmWithoutCardQuestion(asked.count)
      : sendCardRequestsQuestion(asked.count)
    : null;
  const undoOpen = result != null && result.undoUntilMs != null && now() < result.undoUntilMs;

  return (
    <>
      {result ? (
        <View
          style={[styles.banner, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
          testID="card-bulk-result">
          <Text
            variant="bodySmall"
            tone={result.tone === 'danger' ? 'danger' : 'default'}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={styles.bannerText}>
            {result.message}
          </Text>
          <View style={styles.bannerActions}>
            {undoOpen ? (
              <Button label="Undo" size="sm" variant="secondary" loading={undo.isPending} onPress={() => void runUndo()} />
            ) : null}
            <Button
              label="Dismiss"
              size="sm"
              variant="ghost"
              onPress={() => setResult(null)}
            />
          </View>
        </View>
      ) : null}
      <ConfirmSheet
        visible={asked != null}
        title={question?.title ?? ''}
        message={[countChanged, previewLine, question?.body].filter(Boolean).join('\n\n')}
        confirmLabel={question?.confirmLabel}
        destructive={false}
        loading={busy}
        confirmDisabled={nothingToSend}
        onConfirm={() => void run()}
        onClose={() => {
          if (busy) return;
          setOverride(null);
          onCancel();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: spacing.base,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  bannerText: { flexShrink: 1 },
  bannerActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
});
