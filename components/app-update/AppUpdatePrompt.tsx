import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import {
  fetchVersionPolicy,
  getInstalledStoreVersion,
  loadSnooze,
  openStoreListing,
  saveSnooze,
} from '@/lib/app-update/app-update-runtime';
import { decideUpdate, type UpdateDecision } from '@/lib/app-update/version-policy';
import { useAppLock } from '@/providers/AppLockProvider';
import { elevation, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** Coming back to the app re-checks, but not more often than this. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

const STORE_NAME = Platform.OS === 'ios' ? 'the App Store' : 'Google Play';

/**
 * "A new version is available" / "Update required", driven by the website's
 * `app-version.json` (see `lib/app-update/version-policy.ts`).
 *
 * Mounted once, beside the root navigator rather than instead of it (a gate in
 * place of the `<Stack>` is what took the app down on 2026-08-16), so it covers
 * staff and customer sides alike. Never over the Face ID lock: the lock's
 * overlay comes first, and the prompt waits for it.
 *
 * Silent whenever anything is unknown: no installed version (development, Expo
 * Go), no file, a malformed file, or no network.
 */
export function AppUpdatePrompt() {
  const { colors } = useTheme();
  const { isLocked } = useAppLock();
  const [decision, setDecision] = useState<UpdateDecision>({ kind: 'none' });
  const lastCheckRef = useRef(0);
  const checkingRef = useRef(false);

  const check = useCallback(async (force: boolean) => {
    const installed = getInstalledStoreVersion();
    if (!installed || checkingRef.current) return;
    const now = Date.now();
    if (!force && now - lastCheckRef.current < UPDATE_CHECK_INTERVAL_MS) return;
    checkingRef.current = true;
    lastCheckRef.current = now;
    try {
      const [policy, snoozed] = await Promise.all([fetchVersionPolicy(), loadSnooze()]);
      // An unreachable file keeps whatever was decided before: a required
      // update must not vanish because the phone went offline.
      if (!policy) return;
      setDecision(decideUpdate({ policy, platform: Platform.OS, installed, snoozed }));
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void check(true);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check(false);
    });
    return () => subscription.remove();
  }, [check]);

  if (decision.kind === 'none') return null;
  const required = decision.kind === 'required';

  function notNow() {
    if (decision.kind !== 'recommended') return;
    void saveSnooze(decision.latest);
    setDecision({ kind: 'none' });
  }

  return (
    <Modal
      visible={!isLocked}
      transparent
      animationType="fade"
      statusBarTranslucent
      // Android back: puts off a recommended update; a required one stays.
      onRequestClose={required ? () => {} : notNow}>
      <View
        style={[
          styles.backdrop,
          { backgroundColor: required ? colors.background : colors.overlay },
        ]}>
        <View
          accessibilityViewIsModal
          style={[
            styles.card,
            elevation.raised,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}>
          <Text variant="heading" accessibilityRole="header">
            {required ? 'Update required' : 'A new version is available'}
          </Text>
          <Text variant="body" tone="secondary">
            {required
              ? `This version of ResNeo no longer works. Update to version ${decision.latest} from ${STORE_NAME} to carry on.`
              : `ResNeo ${decision.latest} is ready in ${STORE_NAME}.`}
          </Text>
          {decision.message ? <Text variant="bodySmall">{decision.message}</Text> : null}
          <View style={styles.actions}>
            <Button label="Update" onPress={() => void openStoreListing()} fullWidth />
            {required ? null : (
              <Button label="Not now" variant="ghost" onPress={notNow} fullWidth />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.surface,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
