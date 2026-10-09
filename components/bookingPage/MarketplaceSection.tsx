/**
 * Booking page, "ResNeo marketplace": web parity with
 * `src/app/dashboard/settings/sections/MarketplaceSection.tsx` (Docs/marketplace-plan.md §7.2).
 *
 * Every eligible venue is listed by default. This is where an owner sees whether they are
 * showing, what is stopping them if not, which categories (up to three) they are under, and
 * switches the listing off. Staff see the same card read only. Hidden entirely while the server
 * says the marketplace is not available, or when the read fails, exactly as the web.
 */
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { getWebUrl } from '@/lib/env';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  MARKETPLACE_MAX_CATEGORIES,
  isSuggestedCategories,
  makeMainMarketplaceCategory,
  marketplaceCardHint,
  marketplaceCardView,
  marketplaceCategoryLabel,
  marketplaceCollectiveLine,
  marketplaceFixTarget,
  marketplaceStatusLabel,
  toggleMarketplaceCategory,
  visibleMarketplaceReasons,
  type MarketplaceCardData,
  type MarketplacePatch,
} from '@/lib/marketplace/owner-state';
import { useMarketplaceOwnerState, useUpdateMarketplace } from '@/lib/queries/useMarketplace';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const SAVE_FAILED = 'Could not save. Please try again.';

export function MarketplaceSection({ isAdmin }: { isAdmin: boolean }) {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const query = useMarketplaceOwnerState();
  const update = useUpdateMarketplace();
  const [editingCategories, setEditingCategories] = useState(false);
  // The draft follows the server's categories until the owner starts changing them.
  const [draftEdit, setDraftEdit] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const state = query.data;
  if (query.isError || !state || !state.available) return null;

  const draft = draftEdit ?? state.categories;
  const saving = update.isPending;
  const suggested = isSuggestedCategories(state);
  const reasons = visibleMarketplaceReasons(state);
  const collectiveLine = marketplaceCollectiveLine(state.collective);

  async function save(patch: MarketplacePatch, message: string): Promise<boolean> {
    setError(null);
    try {
      await update.mutateAsync(patch);
      setDraftEdit(null);
      hapticSuccess();
      toast.success(message);
      return true;
    } catch (err) {
      hapticWarning();
      setError(err instanceof ApiError && err.message ? err.message : SAVE_FAILED);
      return false;
    }
  }

  function openFix(fixHref: string | null) {
    const target = marketplaceFixTarget(fixHref);
    if (!target) return;
    if (target.kind === 'route') {
      router.push(target.target as Href);
      return;
    }
    void WebBrowser.openBrowserAsync(`${getWebUrl()}${target.target}`).catch(() => undefined);
  }

  function openMarketplace() {
    void WebBrowser.openBrowserAsync(`${getWebUrl()}/book`).catch(() => undefined);
  }

  const pickerDisabled = !isAdmin || saving;

  return (
    <View style={styles.section} testID="marketplace-section">
      <SectionHeader title="ResNeo marketplace" />
      <Card style={styles.card}>
        <Text variant="bodySmall" tone="secondary">
          Customers can find you on the free ResNeo marketplace at{' '}
          <Text variant="bodySmall" color={colors.brand} onPress={openMarketplace} accessibilityRole="link">
            resneo.com/book
          </Text>
          . Your card shows your name, photos, About text, town and what you offer, and links to your
          booking page. It never shows your street address.
        </Text>

        <View style={styles.statusRow} testID="marketplace-status">
          <View
            style={[styles.statusDot, { backgroundColor: state.showing ? colors.success : colors.borderStrong }]}
          />
          <Text variant="bodyMedium">{marketplaceStatusLabel(state)}</Text>
        </View>
        {collectiveLine ? (
          <Text variant="bodySmall" tone="secondary">
            {collectiveLine}
          </Text>
        ) : null}

        <View style={styles.switchRow}>
          <Text variant="bodyMedium" style={styles.flex1}>
            Show my business on the ResNeo marketplace
          </Text>
          <Switch
            value={state.listed}
            disabled={pickerDisabled}
            accessibilityLabel="Show my business on the ResNeo marketplace"
            onValueChange={() =>
              void save(
                { listed: !state.listed },
                state.listed
                  ? 'Your marketplace listing is switched off.'
                  : 'Your marketplace listing is switched on.',
              )
            }
          />
        </View>

        {reasons.length > 0 ? (
          <View
            style={[styles.reasons, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}
            testID="marketplace-reasons">
            <Text variant="label">To appear on the marketplace:</Text>
            {reasons.map((r) => {
              const fix = marketplaceFixTarget(r.fix_href);
              return (
                <View key={r.code} style={styles.reasonRow}>
                  <Text variant="bodySmall">{`• ${r.text}`}</Text>
                  {fix ? (
                    <Pressable accessibilityRole="link" hitSlop={8} onPress={() => openFix(r.fix_href)}>
                      <Text variant="bodySmall" color={colors.brand} style={styles.goThere}>
                        Go there
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {suggested && !editingCategories ? (
          <View
            style={[styles.suggested, { backgroundColor: colors.brandSubtle, borderColor: colors.brandBorder }]}
            testID="marketplace-suggested">
            <Text variant="bodySmall">
              We have listed you under{' '}
              <Text variant="bodySmall" style={styles.bold}>
                {state.categories.map((c) => marketplaceCategoryLabel(state, c)).join(', ')}
              </Text>
              . Is that right?
            </Text>
            {isAdmin ? (
              <View style={styles.buttonRow}>
                <Button
                  label="Yes, that is right"
                  size="sm"
                  disabled={saving}
                  onPress={() => void save({ categories: state.categories }, 'Your marketplace categories are confirmed.')}
                />
                <Button
                  label="Change"
                  size="sm"
                  variant="secondary"
                  disabled={saving}
                  onPress={() => setEditingCategories(true)}
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {!suggested || editingCategories ? (
          <View style={styles.picker}>
            <Text variant="label">Your categories</Text>
            <Text variant="bodySmall" tone="secondary">
              Choose up to three. The first is your main category and shows on your card. Customers
              browsing any of them will find you.
            </Text>
            {state.category_options.map((o) => {
              const index = draft.indexOf(o.value);
              const checked = index !== -1;
              const full = !checked && draft.length >= MARKETPLACE_MAX_CATEGORIES;
              const disabled = pickerDisabled || full;
              return (
                <View
                  key={o.value}
                  style={[
                    styles.option,
                    {
                      borderColor: checked ? colors.brand : colors.border,
                      backgroundColor: checked ? colors.brandSubtle : colors.surfaceRaised,
                      opacity: full ? 0.6 : 1,
                    },
                  ]}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked, disabled }}
                    accessibilityLabel={o.label}
                    disabled={disabled}
                    onPress={() => setDraftEdit(toggleMarketplaceCategory(draft, o.value))}
                    style={styles.optionMain}>
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: checked ? colors.brand : colors.borderStrong,
                          backgroundColor: checked ? colors.brand : 'transparent',
                        },
                      ]}>
                      {checked ? (
                        <Text variant="caption" color={colors.onBrand}>
                          {'✓'}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.flex1}>
                      <View style={styles.optionTitleRow}>
                        <Text variant="bodyMedium">{o.label}</Text>
                        {index === 0 ? (
                          <View style={[styles.mainPill, { backgroundColor: colors.brand }]}>
                            <Text variant="caption" color={colors.onBrand}>
                              Main
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text variant="caption" tone="muted">
                        {o.examples}
                      </Text>
                    </View>
                  </Pressable>
                  {checked && index > 0 && !pickerDisabled ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Make ${o.label} your main category`}
                      hitSlop={8}
                      onPress={() => setDraftEdit(makeMainMarketplaceCategory(draft, o.value))}>
                      <Text variant="caption" color={colors.brand}>
                        Make main
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            {isAdmin ? (
              <View style={styles.buttonRow}>
                <Button
                  label="Save categories"
                  size="sm"
                  disabled={saving}
                  onPress={async () => {
                    const ok = await save({ categories: draft }, 'Your marketplace categories are saved.');
                    if (ok) setEditingCategories(false);
                  }}
                />
                {editingCategories ? (
                  <Button
                    label="Cancel"
                    size="sm"
                    variant="secondary"
                    disabled={saving}
                    onPress={() => {
                      setDraftEdit(null);
                      setEditingCategories(false);
                    }}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {state.card ? (
          <View style={styles.preview}>
            <Text variant="label">Your card</Text>
            <Text variant="bodySmall" tone="secondary">
              {marketplaceCardHint(state.card)}
            </Text>
            <MarketplaceCardPreview card={state.card} />
          </View>
        ) : null}

        {error ? (
          <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </Card>
    </View>
  );
}

/** The card exactly as customers see it on the marketplace, without the link. */
function MarketplaceCardPreview({ card }: { card: MarketplaceCardData }) {
  const { colors } = useTheme();
  const view = marketplaceCardView(card);
  return (
    <View
      style={[styles.mCard, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
      testID="marketplace-preview">
      <View style={[styles.mCover, { backgroundColor: colors.brandSubtle }]}>
        {card.cover_photo_url ? (
          <Image source={{ uri: card.cover_photo_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : null}
        {card.logo_url ? (
          <View style={[styles.mLogo, { borderColor: colors.background, backgroundColor: colors.background }]}>
            <Image source={{ uri: card.logo_url }} style={styles.mLogoImage} contentFit="contain" />
          </View>
        ) : !card.cover_photo_url ? (
          <View style={styles.mInitials}>
            <Text variant="display" color={colors.brand} style={styles.mInitialsText}>
              {view.initials}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.mBody}>
        <Text variant="subheading">{card.name}</Text>
        {view.where ? (
          <Text variant="bodySmall" tone="secondary">
            {view.where}
          </Text>
        ) : null}
        <Text variant="bodySmall" tone="secondary" numberOfLines={3}>
          {view.about}
        </Text>
        {view.chips.length > 0 ? (
          <View style={styles.mChips}>
            {view.chips.map((c) => (
              <View key={c} style={[styles.mChip, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text variant="caption" color={colors.brand}>
                  {c}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.mFooter}>
          <Text variant="bodySmall" tone="secondary">
            {view.price ?? ''}
          </Text>
          <View style={[styles.mBook, { backgroundColor: colors.brand }]}>
            <Text variant="label" color={colors.onBrand}>
              Book now
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  card: { gap: spacing.md },
  flex1: { flex: 1 },
  bold: { fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  reasons: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: spacing.sm },
  goThere: { fontWeight: '700', textDecorationLine: 'underline' },
  suggested: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  picker: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionMain: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  optionTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  mainPill: { borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  preview: { gap: spacing.sm },
  mCard: { borderWidth: 1, borderRadius: 24, overflow: 'hidden', maxWidth: 380 },
  mCover: { aspectRatio: 16 / 9, width: '100%', overflow: 'hidden' },
  mLogo: {
    position: 'absolute',
    left: spacing.base,
    bottom: spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mLogoImage: { width: '100%', height: '100%' },
  mInitials: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  mInitialsText: { opacity: 0.4 },
  mBody: { padding: spacing.base, gap: spacing.sm },
  mChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  mChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  mFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  mBook: { borderRadius: 999, paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
});
