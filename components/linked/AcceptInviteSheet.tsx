import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { useVerifyInvite } from '@/lib/queries/useLinkedVenues';
import { spacing } from '@/theme/index';

/**
 * Pull the invite token out of whatever the user pasted — a full shareable URL
 * (`…?token=…` or `…?invite=…`) or a bare token. Falls back to the trimmed
 * string with trailing URL punctuation stripped.
 */
function extractToken(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  const match = s.match(/[?&](?:token|invite)=([^&\s#]+)/i);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  return s.replace(/[/#?]+$/, '');
}

/**
 * "Have an invite link?" — the receiving end of the invite flow. The user pastes
 * a link another venue shared (or arrives via an `?invite=` deep link); we verify
 * the token server-side and, on a valid + eligible + not-self result, hand the
 * resolved venue back via `onVerified` so the hub can open the request editor
 * pre-filled. Self / expired / ineligible / invalid results show inline.
 */
export function AcceptInviteSheet({
  visible,
  initialToken,
  onClose,
  onVerified,
}: {
  visible: boolean;
  /** Token to verify immediately (from an `?invite=` deep link). */
  initialToken?: string | null;
  onClose: () => void;
  onVerified: (venue: { slug: string; name: string }) => void;
}) {
  const [raw, setRaw] = useState('');
  // The submitted token that drives the verify query (set on Continue / seed).
  const [token, setToken] = useState('');
  // Guards against firing onVerified twice for the same resolved token.
  const handledRef = useRef<string | null>(null);

  const verify = useVerifyInvite(token);

  // Seed / reset each time the sheet opens. A provided initialToken (deep link)
  // is verified straight away.
  useEffect(() => {
    if (!visible) return;
    const seed = initialToken?.trim() ?? '';
    handledRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRaw(seed);
    setToken(seed ? extractToken(seed) : '');
  }, [visible, initialToken]);

  // A valid, eligible, non-self invite resolves to a venue — hand it back and let
  // the hub take over (open the request editor pre-filled). Ref-guarded so the
  // effect can't re-fire for the same token before the parent closes us.
  useEffect(() => {
    if (!visible) return;
    const data = verify.data;
    if (data?.valid && !data.self && data.eligible && handledRef.current !== token) {
      handledRef.current = token;
      onVerified({ slug: data.venueSlug, name: data.venueName });
    }
  }, [visible, verify.data, token, onVerified]);

  const handleSubmit = () => {
    const next = extractToken(raw);
    if (next.length === 0) return;
    handledRef.current = null;
    if (next === token) {
      // Same token (e.g. retry after a network error) — refetch in place.
      void verify.refetch();
    } else {
      setToken(next);
    }
  };

  const message = useMemo<string | undefined>(() => {
    if (token.length === 0) return undefined;
    if (verify.isError) {
      return verify.error instanceof ApiError
        ? verify.error.message
        : 'Could not check that link. Try again.';
    }
    const data = verify.data;
    if (!data) return undefined;
    if (!data.valid) {
      if (data.reason === 'expired')
        return 'This invite link has expired. Ask the venue for a fresh one.';
      if (data.reason === 'misconfigured')
        return 'This invite link isn’t set up correctly. Ask the venue to send a new one.';
      return 'That doesn’t look like a valid invite link.';
    }
    if (data.self) return 'That’s your own venue’s invite link.';
    if (!data.eligible) return data.reason ?? 'You can’t link with this venue right now.';
    return undefined; // eligible & not self → the effect above closes the sheet
  }, [token, verify.isError, verify.error, verify.data]);

  const busy = verify.isFetching && token.length > 0;

  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="70%">
      <View style={styles.body}>
        <View>
          <Text variant="subheading">Have an invite link?</Text>
          <Text variant="bodySmall" tone="secondary">
            Paste the link a venue shared with you. We’ll check it and pre-fill your request.
          </Text>
        </View>

        <Input
          value={raw}
          onChangeText={setRaw}
          placeholder="Paste invite link"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          multiline
          error={message}
          onSubmitEditing={handleSubmit}
          returnKeyType="go"
        />

        <Button
          label="Continue"
          fullWidth
          loading={busy}
          disabled={raw.trim().length === 0}
          onPress={handleSubmit}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.lg,
    paddingBottom: spacing.base,
  },
});
