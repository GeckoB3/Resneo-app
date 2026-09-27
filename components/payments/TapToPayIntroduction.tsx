import { useEffect, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TapToPayEducationContent } from '@/components/payments/TapToPayEducation';
import { TapToPayProgress } from '@/components/payments/TapToPayProgress';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { TAP_TO_PAY_ON_IPHONE } from '@/lib/payments/tap-to-pay-copy';
import {
  hasSeenTapToPayIntro,
  markTapToPayIntroSeen,
} from '@/lib/payments/tap-to-pay-intro-store';
import { TAP_TO_PAY_SPLASH_ARTWORK } from '@/lib/payments/tap-to-pay-marketing';
import { useAppLock } from '@/providers/AppLockProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useTapToPay } from '@/providers/TapToPayProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * "Tap to Pay on iPhone is here": the full-screen introduction every eligible
 * user sees once (Apple's checklist 3.2 and 6.2), and how an existing user finds
 * out the feature exists (the Existing User Flow recording).
 *
 * Built to Apple's Tap to Pay on iPhone guidance:
 *  - it leads with Apple's in-app splash artwork from the Marketing Toolkit
 *    (`TAP_TO_PAY_SPLASH_ARTWORK`), unaltered, with the artwork's own button
 *    made real; nothing home-made stands in for it;
 *  - it offers to accept the terms right here, before any client is waiting
 *    (HIG "Enabling"), and only to an admin (3.8) — anyone else is told to ask
 *    one (3.8.1);
 *  - "Learn more" opens the merchant education (HIG "Educating merchants"), which
 *    also follows straight after the terms are accepted (4.2).
 *
 * Eligible = Tap to Pay on iPhone applies (iOS, entitled build, card-ready venue)
 * and this iPhone is known to support it. Never over the Face ID lock screen,
 * which is an overlay the modal would otherwise cover.
 */
export function TapToPayIntroduction() {
  const { colors } = useTheme();
  const tapToPay = useTapToPay();
  const { user } = useAuth();
  const { isLocked } = useAppLock();
  const userId = user?.id ?? null;
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showEducation, setShowEducation] = useState(false);
  /** Set up from this screen: done, whenever the provider catches up. */
  const [turnedOn, setTurnedOn] = useState(false);

  const eligible = tapToPay.applies && tapToPay.supported === true && userId != null;

  useEffect(() => {
    if (!eligible || !userId) return;
    let cancelled = false;
    void hasSeenTapToPayIntro(userId).then((seen) => {
      if (!cancelled && !seen) setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [eligible, userId]);

  function close() {
    setOpen(false);
    if (userId) void markTapToPayIntroSeen(userId);
  }

  /**
   * Apple's education (iOS 18+) over this screen, else the app's own, inline.
   * Resolves whether Apple's was shown.
   */
  async function learnMore(): Promise<boolean> {
    const shown = await tapToPay.showEducation();
    if (!shown) setShowEducation(true);
    return shown;
  }

  async function setUp() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await tapToPay.enable();
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setTurnedOn(true);
      // Education straight after the terms (4.2). Apple's runs over this screen
      // and returns here; the app's own is shown inline, so stay open for it.
      if (result.acceptedTerms && !(await learnMore())) return;
      // Shown and acted on: the job of this screen is done.
      close();
    } finally {
      setBusy(false);
    }
  }

  const accepted = turnedOn || tapToPay.termsAccepted === true;
  const artwork = TAP_TO_PAY_SPLASH_ARTWORK;
  const askAdmin = tapToPay.termsAccepted === false && !tapToPay.isAdmin;
  /** The artwork's button sets Tap to Pay up while there is something to set up. */
  const ctaSetsUp = !accepted && !askAdmin;
  /**
   * As wide as the screen, unless that would push the buttons below the fold:
   * the whole introduction should be visible at once (and on camera).
   */
  const artworkWidth = artwork
    ? Math.min(
        window.width,
        (window.height - insets.top - insets.bottom - ACTIONS_HEIGHT) * artwork.aspectRatio,
      )
    : 0;

  return (
    <Modal
      visible={open && !isLocked}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={close}>
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.content}>
          {artwork ? (
            <View
              style={[styles.artwork, { width: artworkWidth, aspectRatio: artwork.aspectRatio }]}>
              <Image
                source={artwork.source}
                style={styles.artworkImage}
                resizeMode="contain"
                accessibilityLabel={artwork.accessibilityLabel}
                accessibilityIgnoresInvertColors
              />
              {/* The artwork's own button, made real rather than painted over. */}
              <Pressable
                testID="tap-to-pay-artwork-cta"
                accessibilityRole="button"
                accessibilityLabel={artwork.cta.label}
                disabled={busy}
                onPress={() => void (ctaSetsUp ? setUp() : learnMore())}
                style={[
                  styles.region,
                  {
                    left: `${artwork.cta.region.left * 100}%`,
                    top: `${artwork.cta.region.top * 100}%`,
                    width: `${artwork.cta.region.width * 100}%`,
                    height: `${artwork.cta.region.height * 100}%`,
                  },
                ]}
              />
            </View>
          ) : null}

          <View style={styles.body}>
          <View style={styles.copy}>
            {/* The artwork carries the headline and copy; the text stands in only
                until it has been added. */}
            {!artwork ? (
              <>
                <Text variant="display">{TAP_TO_PAY_ON_IPHONE}</Text>
                <Text variant="body" tone="secondary">
                  Take contactless cards, Apple Pay and other digital wallets right on this
                  iPhone. No card reader needed.
                </Text>
              </>
            ) : null}
            {askAdmin ? (
              <Text variant="bodySmall" tone="muted">
                Ask an admin at your venue to turn it on. Only an admin can accept Apple&apos;s
                terms.
              </Text>
            ) : null}
          </View>

          {tapToPay.preparing ? <TapToPayProgress progress={tapToPay.progress} /> : null}

          {showEducation ? <TapToPayEducationContent /> : null}

          {message ? (
            <Text variant="bodySmall" tone="danger">
              {message}
            </Text>
          ) : null}
          </View>
        </ScrollView>

        <View style={styles.actions}>
          {accepted || askAdmin ? (
            <Button label={showEducation ? 'Done' : 'Got it'} onPress={close} fullWidth />
          ) : !artwork ? (
            <Button
              label={`Set up ${TAP_TO_PAY_ON_IPHONE}`}
              loading={busy}
              disabled={busy}
              onPress={() => void setUp()}
              fullWidth
            />
          ) : null}
          {/* With the artwork, its own button does the setting up, so "Learn more"
              stays on offer beside it; without it, beside "Set up". */}
          {!showEducation && (!artwork || ctaSetsUp) ? (
            <Button
              label="Learn more"
              variant="secondary"
              disabled={busy}
              onPress={() => void learnMore()}
              fullWidth
            />
          ) : null}
          {ctaSetsUp ? (
            <Button label="Not now" variant="ghost" disabled={busy} onPress={close} fullWidth />
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/** Room kept below the artwork for the two buttons and their padding. */
const ACTIONS_HEIGHT = 140;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.lg,
  },
  body: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  artwork: {
    alignSelf: 'center',
  },
  artworkImage: {
    width: '100%',
    height: '100%',
  },
  region: {
    position: 'absolute',
  },
  copy: {
    gap: spacing.sm,
  },
  actions: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
});
