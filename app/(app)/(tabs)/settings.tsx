import Constants from "expo-constants";
import { SymbolView } from "expo-symbols";
import * as WebBrowser from "expo-web-browser";
import { useRouter, type Href } from "expo-router";
import {
  Fragment,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Linking, Platform, StyleSheet, Switch, View } from "react-native";

import { AskResneoRow } from "@/components/more/AskResneoRow";
import { FeatureTile } from "@/components/more/FeatureTile";
import { MoreHero } from "@/components/more/MoreHero";
import { MoreRow } from "@/components/more/MoreRow";
import { PrimaryTile } from "@/components/more/PrimaryTile";
import {
  CardReaderRow,
  inPersonPaymentsInBookingSettings,
} from "@/components/payments/InPersonPayments";
import { TapToPaySettings } from "@/components/payments/TapToPaySettings";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PlatformAnnouncementBanners } from "@/components/ui/PlatformAnnouncementBanners";
import { LoadingState } from "@/components/ui/LoadingState";
import { PressableScale } from "@/components/ui/PressableScale";
import { Screen } from "@/components/ui/Screen";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { getAppVersion, getWebUrl } from "@/lib/env";
import {
  isLoyaltyEnabled,
  isPosEnabled,
  isShopEnabled,
  isVouchersEnabled,
  posOffer,
  posOfferDoor,
  posPromptDismissed,
} from "@/lib/pos/pos-enabled";
import { offerDoorOpen } from "@/lib/pos/switches/model";
import { offerScope, useOfferHidden } from "@/lib/pos/switches/offer-dismissal";
import {
  buildDestinations,
  LIST_GROUPS,
  type Destination,
} from "@/lib/navigation/more-destinations";
import { useBillingStatus } from "@/lib/queries/useBillingStatus";
import { useCollectives } from "@/lib/queries/useCollectives";
import { usePosWayBack } from "@/lib/queries/useFeatureSwitches";
import { useNotifications } from "@/lib/queries/useNotifications";
import { useOrdersTile } from "@/lib/queries/useOrders";
import { sellProductsOn } from "@/lib/pos/setup/answers";
import { usePosBootstrap } from "@/lib/queries/usePos";
import { useStaffMe } from "@/lib/queries/useStaffMe";
import { useMeSites } from "@/lib/queries/useMeSites";
import { showsSitePicker } from "@/lib/sites/sites";
import { useWebDashboardLink } from "@/lib/sites/useWebDashboardLink";
import { hasBillingPayoutsAdmins } from "@/lib/roles/roles";
import { useAppLock } from "@/providers/AppLockProvider";
import { switchAppMode } from "@/lib/mode/app-mode-store";
import { useAuth } from "@/providers/AuthProvider";
import { useTapToPay } from "@/providers/TapToPayProvider";
import { useToast } from "@/providers/ToastProvider";
import { useVenueContext } from "@/providers/VenueProvider";
import { radius, spacing } from "@/theme/index";
import { useTheme } from "@/theme/useTheme";
import type { StaffRole } from "@/types/staff";
import type { BookingModel } from "@/types/venue";

/**
 * Subscription/plan statuses that warrant a warning banner. These are the exact
 * values the billing backend emits (`PlanStatus`) — the old set used Stripe-ish
 * names (`canceled`/`unpaid`/`expired`) the server never writes, and omitted the
 * real `cancelling`, so the banner could never fire.
 */
const WARN_PLAN_STATUSES = new Set(["past_due", "cancelling", "cancelled"]);

/** Resolve a staff-dashboard URL on the WEB origin (not the API origin). */
function webDashboardUrl(path = "/dashboard"): string {
  const base = getWebUrl();
  return base ? `${base}${path}` : `https://reserve-ni.vercel.app${path}`;
}

function formatStaffRole(role: StaffRole): string {
  return role === "admin" ? "Admin" : "Staff";
}

/** Time-of-day eyebrow for the hero. */
function greetingFor(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Uppercase section header sitting above its inset group. */
function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      {title ? (
        <Text variant="overline" tone="muted" style={styles.groupTitle}>
          {title}
        </Text>
      ) : null}
      <Card padded={false}>{children}</Card>
    </View>
  );
}

/**
 * More tab — the entry point to every surface beyond Calendar / Appointments /
 * Contacts. A brand-gradient identity hero, the Ask ResNeo row, a "quick
 * actions" grid of the daily-driver tools, and the full grouped settings list.
 *
 * Ask ResNeo stands where the settings search field used to: a person at the
 * top of this tab is looking for how to do something, and an answer from the
 * help centre beats a filtered list of screen names. The synonyms that fed that
 * filter stay on each destination (`Destination.keywords`) so the row is not a
 * one-way door.
 */
export default function MoreScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { signOut } = useAuth();

  const toast = useToast();
  const { data: staffData, isLoading: staffLoading } = useStaffMe();
  const { venue, name: venueName, isLoading: venueLoading } = useVenueContext();
  const notificationsQuery = useNotifications();
  // One login, several sites (web roles plan §6.2c): the picker in the header, for anyone with more
  // than one site, an invite waiting or the All sites overview. Nobody else sees a change.
  const meSitesQuery = useMeSites();
  const siteSwitch = showsSitePicker(meSitesQuery.data)
    ? {
        onPress: () => router.push("/sites" as Href),
        inviteCount: meSitesQuery.data?.pending_invites.length ?? 0,
      }
    : undefined;
  const {
    appLockEnabled,
    setAppLockEnabled,
    supported: appLockSupported,
  } = useAppLock();
  const tapToPay = useTapToPay();
  const [appLockBusy, setAppLockBusy] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const staff = staffData?.staff;
  const isAdmin = staff?.role === "admin";
  const appVersion = getAppVersion();
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;

  // Live subscription status drives the billing-problem nudge. `plan_status` is
  // NOT on the venue bootstrap (GET /api/venue omits it), so read it from the
  // billing endpoint, which needs the owner or an admin with "Billing, payouts
  // and admins" (web roles plan §5.3): gated so nobody else hits (and 403s) it.
  const canManageBilling = isAdmin && hasBillingPayoutsAdmins(staff);
  const billingStatusQuery = useBillingStatus(canManageBilling);
  const planStatus = billingStatusQuery.data?.plan_status ?? null;
  const showPlanWarning =
    canManageBilling && planStatus != null && WARN_PLAN_STATUSES.has(planStatus);

  // In-app browser tab (SFSafariViewController / Chrome Custom Tab) so web
  // content opens without bouncing the user out of the app. A dashboard path
  // names this venue (`?site=`), so a multi-site login lands on the business
  // the app is showing (web roles plan §6.2b).
  const siteLink = useWebDashboardLink();
  const openWeb = useCallback(
    (path: string) => {
      const url = webDashboardUrl(siteLink(path));
      void WebBrowser.openBrowserAsync(url).catch(() =>
        Linking.openURL(url).catch(() =>
          toast.error("Could not open the browser."),
        ),
      );
    },
    [siteLink, toast],
  );

  // Toggle the opt-in biometric lock. Enabling prompts for Face ID/passcode
  // (handled inside the provider); if the user cancels, the switch stays off.
  const handleAppLockToggle = useCallback(
    async (next: boolean) => {
      setAppLockBusy(true);
      try {
        const ok = await setAppLockEnabled(next);
        if (ok) {
          toast.success(
            next ? "Biometric lock turned on." : "Biometric lock turned off.",
          );
        } else if (next) {
          // Auth was cancelled/failed, or the preference could not be saved.
          toast.info("Biometric lock was not turned on.");
        }
      } finally {
        setAppLockBusy(false);
      }
    },
    [setAppLockEnabled, toast],
  );

  // Build the full, role- and eligibility-aware index once. The grid, the
  // grouped list and search all derive from this single array. Gating lives in
  // the pure `buildDestinations` builder (unit-tested separately).
  // The Collective area is offered while this venue is in a live shared-services collective.
  const collectivesQuery = useCollectives({ enabled: isAdmin });
  const liveCollectiveName = useMemo(() => {
    const live = (collectivesQuery.data?.collectives ?? []).find(
      (c) =>
        c.status === "active" &&
        c.serviceModel === "replicas" &&
        (c.isHost || c.myMembershipStatus === "active"),
    );
    return live?.name ?? null;
  }, [collectivesQuery.data]);

  // Orders (POS app step 5): for logins with manage_orders, while the shop is on or new paid
  // orders are waiting. Nothing is asked at a venue without Checkout.
  const ordersTile = useOrdersTile(venue);
  // What this login may do at Checkout, for the Checkout set-up rows. Asked only at a POS venue.
  const posBoot = usePosBootstrap({ enabled: isPosEnabled(venue) });
  const posCan = useMemo(() => {
    // Read by key: not every capability the web sends is in the app's PosCapability type.
    const caps = posBoot.data?.capabilities as
      Record<string, boolean | undefined> | undefined;
    return {
      manage_settings: caps?.manage_settings === true,
      view_reports: caps?.view_reports === true,
      import_products: caps?.import_products === true,
    };
  }, [posBoot.data]);
  // "Sell products" off (POS Part 4, OB3) hides Products and stock; unknown until the bootstrap is in.
  const sellProducts = sellProductsOn(posBoot.data?.settings);

  // Checkout's offer while it is off (POS Part 5): the Checkout tile for an admin, with "New" while
  // the door is open (the web's rule: offered, no sale yet, not hidden); and the way back to what
  // is left to finish after switching off.
  const offer = posOffer(venue);
  const offerState = offer.state;
  const hiddenHere = useOfferHidden(isAdmin ? offerScope(venue?.id, staff?.id) : null);
  const offerNew = offerDoorOpen({
    isAdmin,
    posEnabled: isPosEnabled(venue),
    offer,
    door: posOfferDoor(venue),
    dismissed: posPromptDismissed(venue, "pos_offer"),
    hiddenHere,
  });
  const wayBack = usePosWayBack(venue, isAdmin);
  const wayBackOrders = wayBack.orders;
  const wayBackNewOrders = wayBack.ordersNewCount;
  const wayBackSales = wayBack.salesHistory;

  const destinations = useMemo<Destination[]>(() => {
    const enabledModels = new Set<BookingModel>([
      ...(venue?.active_booking_models ?? []),
      ...(venue?.enabled_models ?? []),
      ...(venue?.booking_model ? [venue.booking_model] : []),
    ]);
    return buildDestinations({
      isAdmin,
      enabledModels,
      pricingTier: venue?.pricing_tier,
      complianceEnabled:
        venue?.feature_flags?.resolved?.compliance_records_enabled === true,
      waitlistEnabled: venue?.feature_flags?.resolved?.waitlist_v2 === true,
      collectiveArea: liveCollectiveName ? { name: liveCollectiveName } : null,
      posEnabled: isPosEnabled(venue),
      loyaltyEnabled: isLoyaltyEnabled(venue),
      ordersEnabled: ordersTile.enabled,
      ordersNewCount: ordersTile.newCount,
      shopEnabled: isShopEnabled(venue),
      vouchersEnabled: isVouchersEnabled(venue),
      posCan,
      sellProducts,
      posOfferState: offerState,
      posOfferNew: offerNew,
      posWayBack: {
        orders: wayBackOrders,
        ordersNewCount: wayBackNewOrders,
        salesHistory: wayBackSales,
      },
    });
  }, [
    isAdmin,
    venue,
    liveCollectiveName,
    ordersTile.enabled,
    ordersTile.newCount,
    posCan,
    sellProducts,
    offerState,
    offerNew,
    wayBackOrders,
    wayBackNewOrders,
    wayBackSales,
  ]);

  const handlePress = useCallback(
    (dest: Destination) => {
      if (dest.kind === "route" && dest.target)
        router.push(dest.target as Href);
      else if (dest.kind === "web" && dest.target) openWeb(dest.target);
    },
    [router, openWeb],
  );

  // The hero tile (single most-used) sits above the two-up grid of the other
  // daily-driver tools, giving the top zone a clear size hierarchy.
  const primary = useMemo(
    () => destinations.find((d) => d.primary) ?? null,
    [destinations],
  );
  const featured = useMemo(
    () => destinations.filter((d) => d.featured && !d.primary),
    [destinations],
  );

  if (staffLoading || venueLoading) {
    return (
      <Screen bottomInset={false}>
        <LoadingState message="Loading…" />
      </Screen>
    );
  }

  // In-person payments (Tap to Pay §6.7 / §7A.6). An admin of an Appointments-plan venue finds
  // the switch, the card reader and Tap to Pay in Booking settings, "Taking payment in person",
  // as on the web (owner, 2026-10-15), so More shows them none of it. Everyone else keeps what
  // they had here: the card reader row once the venue has it on (staff can pair hardware but not
  // decide whether the venue takes cards), and Tap to Pay on iPhone, whose terms only an admin
  // accepts.
  const paymentSections = inPersonPaymentsInBookingSettings({
    isAdmin,
    pricingTier: venue?.pricing_tier,
  }) ? null : (
    <>
      {venue?.in_person_payments_enabled ? (
        <Group title="In-person payments">
          <CardReaderRow isFirst />
        </Group>
      ) : null}

      {/* Tap to Pay on iPhone: its status and how to use it. Apple requires both
          to be reachable outside a payment. iOS only, and only once the venue
          can take card payments at all. */}
      {tapToPay.applies ? (
        <Group title="Tap to Pay on iPhone">
          <TapToPaySettings />
        </Group>
      ) : null}
    </>
  );

  return (
    <Screen
      scroll
      padded={false}
      bottomInset={false}
      contentContainerStyle={styles.content}
    >
      {/* ResNeo's announcements, at the top as across the web dashboard. */}
      <PlatformAnnouncementBanners />

      <MoreHero
        name={staff?.name ?? "Staff member"}
        subtitle={venueName ?? staff?.email ?? ""}
        roleLabel={staff ? formatStaffRole(staff.role) : ""}
        greeting={greetingFor()}
        unreadCount={unreadCount}
        onPressProfile={() => router.push("/manage/account" as Href)}
        onPressNotifications={() => router.push("/notifications" as Href)}
        siteSwitch={siteSwitch}
      />

      {/* Plan warning banner for admins when billing has an issue */}
      {showPlanWarning ? (
        <PressableScale
          onPress={() => router.push("/manage/plan" as Href)}
          accessibilityLabel="Plan issue: tap to view billing"
          style={[
            styles.planWarning,
            {
              backgroundColor: colors.warningSurface,
              borderColor: colors.warning,
            },
          ]}
        >
          <SymbolView
            name={{
              ios: "exclamationmark.triangle.fill",
              android: "warning",
              web: "warning",
            }}
            tintColor={colors.warning}
            size={18}
          />
          <View style={styles.planWarningText}>
            <Text variant="label" color={colors.warning}>
              Subscription issue
            </Text>
            <Text variant="caption" color={colors.warning}>
              Your plan is {planStatus}. Tap to manage billing.
            </Text>
          </View>
        </PressableScale>
      ) : null}

      {/* Hidden only on an explicit "off" from the venue bootstrap (web #183);
          an older deploy sends no flag and keeps the row, whose screen still
          explains a 404. */}
      {venue?.assistant_enabled !== false ? (
        <AskResneoRow onPress={() => router.push("/assistant" as Href)} />
      ) : null}

      <View style={styles.section}>
        <Text variant="overline" tone="muted" style={styles.sectionLabel}>
          Quick actions
        </Text>
        {primary ? (
          <PrimaryTile
            icon={primary.icon}
            tint={primary.tile}
            label={primary.label}
            hint={primary.hint}
            onPress={() => handlePress(primary)}
          />
        ) : null}
        {featured.length ? (
          <View style={styles.grid}>
            {featured.map((dest) => (
              <FeatureTile
                key={dest.id}
                icon={dest.icon}
                tint={dest.tile}
                label={dest.label}
                hint={dest.hint}
                badge={dest.badge}
                onPress={() => handlePress(dest)}
              />
            ))}
          </View>
        ) : null}
      </View>

      {LIST_GROUPS.map((g) => {
        const rows = destinations.filter((d) => d.group === g.key);
        // In-person payments and Tap to Pay sit straight after Checkout set-up (owner, 2026-10-09),
        // for the logins that still find them here.
        const after = g.key === "checkoutSetup" ? paymentSections : null;
        if (rows.length === 0)
          return after ? <Fragment key={g.key}>{after}</Fragment> : null;
        return (
          <Fragment key={g.key}>
            <Group title={g.title}>
              {rows.map((dest, index) => (
                <MoreRow
                  key={dest.id}
                  isFirst={index === 0}
                  icon={dest.icon}
                  tile={dest.tile}
                  label={dest.label}
                  hint={dest.hint}
                  external={dest.external}
                  onPress={() => handlePress(dest)}
                />
              ))}
            </Group>
            {after}
          </Fragment>
        );
      })}

      {/* Privacy & security — opt-in biometric app lock. Only shown when the
          device actually has Face ID / fingerprint enrolled (W9.1). */}
      {appLockSupported ? (
        <Group title="Privacy & security">
          <View style={styles.toggleRow}>
            <View style={styles.toggleLabel}>
              <Text variant="bodyMedium">
                {Platform.OS === "ios"
                  ? "Require Face ID / biometric unlock"
                  : "Require fingerprint or face unlock"}
              </Text>
              <Text variant="caption" tone="muted">
                Lock the app when it returns from the background so client
                records stay private.
              </Text>
            </View>
            <Switch
              value={appLockEnabled}
              onValueChange={(v) => void handleAppLockToggle(v)}
              disabled={appLockBusy}
              accessibilityLabel="Require biometric unlock"
            />
          </View>
        </Group>
      ) : null}

      {/*
        The way across to the customer side, for somebody who is both.

        Shown only when there is a customer side to reach: `canSwitch` is false
        for a confirmed customer, who has no staff app, and this row lives in
        the staff app anyway. It sits above sign out because it is the gentler
        neighbour of the same idea, "I am done being staff for now", and a
        person looking for one often wants the other.
      */}
      {/*
        Always offered here, because everyone signed into the staff app has a
        customer side: the customer routes read `user_profiles`, which every
        signed-in user has, so "my own bookings" is a real place for a staff
        member even if it is empty.

        This writes the choice straight to the store rather than going through
        `useAppMode`. That hook also resolves the role and reads the profile,
        which this screen has no use for, and pulling it in here made the More
        tab require a QueryClient it had never needed.
      */}
      <Group title="Your own bookings">
        <View style={styles.switchBody}>
          <Button
            label="Switch to my account"
            variant="secondary"
            onPress={() => switchAppMode("customer")}
          />
          <Text variant="caption" tone="muted" style={styles.switchNote}>
            See the bookings you have made as a customer. You can switch back at
            any time.
          </Text>
        </View>
      </Group>

      {/* Sign out */}
      <Card padded={false}>
        <PressableScale
          onPress={() => setSignOutOpen(true)}
          haptic
          accessibilityLabel="Sign out"
          style={styles.signOutRow}
        >
          <SymbolView
            name={{
              ios: "rectangle.portrait.and.arrow.right",
              android: "logout",
              web: "logout",
            }}
            tintColor={colors.danger}
            size={18}
          />
          <Text variant="bodyMedium" color={colors.danger}>
            Sign out
          </Text>
        </PressableScale>
      </Card>

      <Text variant="caption" tone="muted" style={styles.version}>
        ResNeo v{appVersion}
      </Text>

      {/* Sign-out confirm — a Sheet (not Alert.alert, which is a no-op on web). */}
      <Sheet visible={signOutOpen} onClose={() => setSignOutOpen(false)}>
        <View style={styles.signOutSheet}>
          <Text variant="subheading">Sign out?</Text>
          <Text variant="bodySmall" tone="secondary">
            You can sign back in with the same work email.
          </Text>
          <View style={styles.signOutActions}>
            <Button
              label="Cancel"
              variant="secondary"
              style={styles.flex1}
              onPress={() => setSignOutOpen(false)}
            />
            <Button
              label="Sign out"
              variant="danger"
              style={styles.flex1}
              onPress={() => {
                setSignOutOpen(false);
                void signOut();
              }}
            />
          </View>
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing["3xl"],
    gap: spacing.lg,
  },
  section: {
    gap: spacing.md,
  },
  sectionLabel: {
    marginLeft: spacing.xs,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  group: {
    gap: spacing.xs,
  },
  groupTitle: {
    marginLeft: spacing.md,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.base,
  },
  toggleLabel: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  switchBody: { padding: spacing.base },
  switchNote: { marginTop: 8 },
  signOutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  version: {
    textAlign: "center",
  },
  planWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.base,
  },
  planWarningText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  signOutSheet: {
    gap: spacing.md,
  },
  signOutActions: {
    flexDirection: "row",
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
});
