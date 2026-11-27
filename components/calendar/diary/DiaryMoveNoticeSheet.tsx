import { StyleSheet, View } from 'react-native';

import { type RescheduleTarget } from '@/components/calendar/RescheduleSheet';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { type MoveNotice } from '@/lib/calendar/move-notice';
import { spacing } from '@/theme/index';

export interface DiaryMoveNoticeSheetProps {
  moveNotice: MoveNotice<RescheduleTarget> | null;
  closeMoveNotice: () => void;
  handleNotifyMove: () => void;
  handleUndoMove: () => void;
}

/**
 * After a drag move: notify the client of the new time, skip, or undo (see
 * `useDiaryMoveNotice`). Moved out of the diary screen unchanged (codebase
 * standards P5.2).
 */
export function DiaryMoveNoticeSheet({
  moveNotice,
  closeMoveNotice,
  handleNotifyMove,
  handleUndoMove,
}: DiaryMoveNoticeSheetProps) {
  return (
    <Sheet visible={moveNotice !== null} onClose={closeMoveNotice}>
      <Text variant="subheading">
        {/* A visit says so: what moved was several services, and Undo puts
            all of them back. */}
        {moveNotice?.previous.visit ? 'Service moved' : 'Booking moved'}
      </Text>
      <Text variant="caption" tone="muted">
        {!moveNotice
          ? ''
          : moveNotice.startMoved
            ? `Let ${moveNotice.guestName} know about the change?`
            : `The start time has not changed, so ${moveNotice.guestName} has not been told.`}
      </Text>
      {moveNotice?.overlapNote ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {moveNotice.overlapNote}
        </Text>
      ) : null}
      <View style={styles.moveNoticeActions}>
        {moveNotice?.startMoved ? (
          <>
            <Button
              label={`Notify ${moveNotice.guestName}`}
              fullWidth
              onPress={handleNotifyMove}
            />
            <Button
              label="Don't notify"
              variant="secondary"
              fullWidth
              onPress={closeMoveNotice}
            />
          </>
        ) : null}
        <Button label="Undo change" variant="ghost" fullWidth onPress={handleUndoMove} />
        {moveNotice && !moveNotice.startMoved ? (
          <Button label="Done" variant="secondary" fullWidth onPress={closeMoveNotice} />
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  moveNoticeActions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
