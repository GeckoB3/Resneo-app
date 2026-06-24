import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticError, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import { useRequestAccountDeletion } from '@/lib/queries/useAccountDeletion';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type DeleteAccountSheetProps = {
  visible: boolean;
  /** The signed-in user's email — shown in the post-request cancel hint when known. */
  email?: string | null;
  onClose: () => void;
  /**
   * Fired when the user dismisses the success confirmation (Done, or by closing
   * the sheet after the request succeeded). The parent signs the user out — the
   * server has already revoked the session globally — and the root layout routes
   * back to sign-in.
   */
  onDeleted: () => void;
};

/** "30 Jun 2026" from an ISO timestamp (date portion only); null when absent. */
function formatScheduledDate(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso.slice(0, 10);
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Danger-zone "Delete account" flow — the mobile equivalent of the web
 * `/account/security` delete-account card. Satisfies Apple Guideline 5.1.1(v):
 * an in-app, self-serve path to permanently delete the account created at sign-up
 * (distinct from venue deletion, which leaves the login intact).
 *
 * Two states drive the body:
 *   - request   → the armed type-the-phrase-to-confirm form,
 *   - scheduled → the success confirmation (dismissing it signs the user out).
 *
 * The destructive action is armed by typing the exact confirmation phrase
 * (case-insensitive), mirroring the web confirm. NO `Alert.alert` — it is a
 * no-op on react-native-web and too easy to mis-handle on a destructive path.
 */
export function DeleteAccountSheet({ visible, email, onClose, onDeleted }: DeleteAccountSheetProps) {
  const { colors } = useTheme();
  const requestMutation = useRequestAccountDeletion();

  const phrase = t('account.delete.confirmPhrase');
  const [confirmation, setConfirmation] = useState('');
  // `undefined` while the request form is still showing; once set (incl. a null
  // date) the success confirmation is shown.
  const [scheduledAt, setScheduledAt] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  // Reset transient state each time the sheet (re)opens.
  const [prevVisible, setPrevVisible] = useState(false);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setConfirmation('');
      setScheduledAt(undefined);
      setError(null);
    }
  }

  const submitted = scheduledAt !== undefined;
  const busy = requestMutation.isPending;

  // Case-insensitive exact match, mirroring the web confirm gate.
  const confirmMatches =
    confirmation.trim().length > 0 &&
    confirmation.trim().toLowerCase() === phrase.trim().toLowerCase();

  function handleClose() {
    if (busy) return; // never dismiss mid-request
    setConfirmation('');
    setError(null);
    onClose();
  }

  async function handleRequest() {
    if (!confirmMatches || busy) return;
    hapticWarning();
    setError(null);
    try {
      const res = await requestMutation.mutateAsync();
      hapticSuccess();
      setConfirmation('');
      setScheduledAt(res.deletion_scheduled_at ?? null);
    } catch (err) {
      hapticError();
      setError(err instanceof ApiError ? err.message : t('account.delete.error'));
    }
  }

  const formattedDate = formatScheduledDate(scheduledAt ?? null);

  return (
    <Sheet visible={visible} onClose={submitted ? onDeleted : handleClose} maxHeight="90%" fill>
      <View style={styles.header}>
        <Text variant="overline" tone="danger">
          {t('account.delete.dangerZone')}
        </Text>
        <Text variant="subheading">{t('account.delete.sheetTitle')}</Text>
        <Text variant="caption" tone="muted">
          {t('account.delete.sheetIntro')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.dangerBox,
            { backgroundColor: colors.dangerSurface, borderColor: colors.danger },
          ]}>
          {submitted ? (
            // ----- Success / confirmation -----
            <View style={styles.section}>
              <View style={styles.scheduledRow}>
                <Badge label={t('account.delete.scheduledTitle')} tone="danger" />
              </View>
              <Text variant="bodySmall" tone="secondary">
                {formattedDate
                  ? t('account.delete.scheduledBody', { date: formattedDate })
                  : t('account.delete.scheduledBodyNoDate')}
              </Text>
              <Text variant="caption" tone="secondary">
                {email
                  ? t('account.delete.cancelHintEmail', { email })
                  : t('account.delete.cancelHint')}
              </Text>
              <Button
                label={t('account.delete.done')}
                variant="secondary"
                fullWidth
                onPress={onDeleted}
              />
            </View>
          ) : (
            // ----- Request form (armed type-to-confirm) -----
            <View style={styles.section}>
              <Input
                label={t('account.delete.confirmLabel', { phrase })}
                value={confirmation}
                onChangeText={(v) => {
                  setConfirmation(v);
                  if (error) setError(null);
                }}
                placeholder={phrase}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!busy}
              />
              {error ? (
                <Text variant="bodySmall" tone="danger">
                  {error}
                </Text>
              ) : null}
              <Button
                label={busy ? t('account.delete.working') : t('account.delete.confirmButton')}
                variant="danger"
                fullWidth
                loading={busy}
                disabled={busy || !confirmMatches}
                onPress={() => void handleRequest()}
              />
            </View>
          )}
        </View>

        {!submitted ? (
          <Button
            label={t('account.delete.keep')}
            variant="ghost"
            fullWidth
            disabled={busy}
            onPress={handleClose}
          />
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.xxs,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
    gap: spacing.md,
  },
  dangerBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.base,
  },
  section: {
    gap: spacing.md,
  },
  scheduledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
