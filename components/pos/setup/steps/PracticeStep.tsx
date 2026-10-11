import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { useOpenPracticeSale } from '@/components/pos/practice/api';
import { StatusLine } from '@/components/pos/setup/parts';
import { SetupButtons, SetupFrame, type SetupData } from '@/components/pos/setup/SetupFrame';
import { useStepRunner } from '@/components/pos/setup/useStepRunner';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { setupT } from '@/lib/pos/setup/copy';
import { stepState } from '@/lib/pos/setup/flow';
import { useRefreshSetupStatus } from '@/lib/queries/usePosSetup';
import { spacing } from '@/theme/index';

/**
 * W11, "Try a practice sale" (design 6.3 and 6.8, owner decision OB4): "Start a practice sale"
 * makes a real sale marked practice (`POST /api/venue/pos/sales` with `practice: true`), which the
 * database refuses any payment on, and opens it on the sale screen, whose practice mode shows each
 * way to pay without running it and ends with "Finish practice" (voided with "Practice"). The
 * starting is the practice sale's own (`useOpenPracticeSale`), which also makes sure a server that
 * does not know practice sales never hands over a real one. Coming back here after a practice says
 * it was cleared away, and Continue goes on to W12. "Skip" moves on.
 */
export function PracticeStep({ data }: { data: SetupData }) {
  const runner = useStepRunner('practice', data);
  const practice = useOpenPracticeSale();
  const refresh = useRefreshSetupStatus();
  const finished = stepState(data.status, 'practice') === 'done';

  // Back from the practice: its tick comes from the data, so read the status again.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const onStart = () => {
    runner.setError(null);
    void practice.open();
  };
  const error = runner.error ?? practice.error;

  return (
    <SetupFrame
      screen="practice"
      data={data}
      title={setupT('setup.practice.title')}
      intro={setupT('setup.practice.body')}
      footer={
        finished ? (
          <View style={styles.buttons}>
            <SetupButtons onContinue={() => void runner.proceed()} busy={runner.busy} error={error} />
            <Button
              label={setupT('setup.practice.start')}
              variant="ghost"
              fullWidth
              onPress={onStart}
              loading={practice.opening}
              disabled={runner.busy !== null}
            />
          </View>
        ) : (
          <View style={styles.buttons}>
            {error ? (
              <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            <Button
              label={setupT('setup.practice.start')}
              size="lg"
              fullWidth
              onPress={onStart}
              loading={practice.opening}
              disabled={runner.busy !== null}
            />
            <Button
              label={setupT('setup.practice.skip')}
              variant="ghost"
              fullWidth
              onPress={() => void runner.skip()}
              loading={runner.busy === 'skip'}
              disabled={runner.busy !== null || practice.opening}
            />
          </View>
        )
      }>
      {finished ? <StatusLine tone="done">{setupT('setup.practice.finished')}</StatusLine> : null}
    </SetupFrame>
  );
}

const styles = StyleSheet.create({
  buttons: { gap: spacing.sm },
});
