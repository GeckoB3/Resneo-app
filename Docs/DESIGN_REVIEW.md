# Resneo Mobile — Design Review

_Generated 2026-06-11 by Design Master audit._

---

## Design Rubric (app-wide standard)

1. **No raw `<Text>` from react-native.** Every visible string uses `<Text variant="…">` from `components/ui/Text`. Raw RN Text (EmptyState, ErrorState, LoadingState, LinkedVenueBanner, staff-required screen) must be replaced. Typography tokens — not inline `fontSize`/`fontWeight` — carry all size and weight.

2. **No hardcoded hex colours.** All colour values come from `useTheme().colors.*` or the named token exports (`brand`, `accent`, etc.). Hardcoded hex in styles (reports step-line `#E2E8F0`, plan step-line `#E2E8F0`, BaselineMetricsCard violet/blue surface pairs, settings TILE map) must be replaced with semantic tokens.

3. **`fontWeight` strings are banned.** Use `fonts.*` family names (`Inter_700Bold`, etc.) instead of `fontWeight: '700'` or `'600'` — weight is encoded in the family on both iOS and Android (see AddonsStep, BreaksEditor, ComplianceFlagBadge, BaselineMetricsCard, GreetingHeader, LinkedVenueBanner, ComplianceCard, AddonLinksSheet).

4. **`TouchableOpacity` is banned.** All interactive elements use `Pressable` for consistent ripple/opacity feedback. Replace every `TouchableOpacity` in `reports.tsx`.

5. **All touch targets ≥ 44 pt.** Any `Pressable` or `Pressable`-equivalent with no explicit `minHeight` and no `hitSlop` that appears to be smaller than 44 pt (WeekStrip day cells at 34 pt, BookingDetailSheet header icon buttons at 32 pt, BreaksEditor step buttons at 32 pt) must gain `minHeight: minTouchTarget` or adequate `hitSlop`.

6. **Sheet headers are uniform.** Every bottom sheet with a title uses the pattern: drag handle (from Sheet) → `<View style={sheetHeader}>` → `<Text variant="subheading">Title</Text>` → `<Pressable>` close × icon (right). Sheets that omit the title row (CreateContactSheet, ContactFilterSheet body) or use a plain `<Text variant="label">` (BookingDetailSheet uses `"label"` + `tone="muted"`) must align to `"subheading"`.

7. **Section headers inside scroll views use `variant="overline"`.** Ad-hoc CAPS labels produced by inline `textTransform`/`letterSpacing` on `caption` (GreetingHeader overline, DiarySection eyebrow) must switch to `<Text variant="overline">`.

8. **Skeletons cover every async list/detail.** Screens that skip the skeleton on initial load and instead show a blank or spinner-only state (manage/hours, manage/booking-settings, manage/communications, manage/venue-profile, manage/plan, reports range-change) must use `<ListSkeleton>` or `<DetailSkeleton>` while data is pending.

9. **Pull-to-refresh on every scrollable data list.** Manage screens whose ScrollView wraps a data query and has no `refreshControl` (hours, booking-settings, communications, venue-profile) must add a `<RefreshControl>` wired to the query's `refetch`.

10. **`borderRadius` uses tokens.** Inline magic numbers (`borderRadius: 12` in AlertsCard, CapacityCard, InviteStaffSheet, PlanChangeTierSheet, StaffMemberSheet) must use `radius.card` (16) or `radius.md` (12) — prefer `radius.card` for card-shaped surfaces and `radius.md` for compact controls.

11. **Button hierarchy: one primary CTA per view.** Forms and sheets with two equal `variant="primary"` or no clear hierarchy must follow: primary = brand fill, secondary = outlined, ghost = text-only. Destructive actions use `variant="danger"`.

12. **Haptics on every confirmed mutating action.** Every successful mutation should fire `hapticSuccess()`; every failure `hapticWarning()`. Screens/components that save without haptics (OpeningHoursEditor inline steppers, WorkingHoursEditor) must add them.

13. **Dark-mode correctness for hardcoded surfaces.** Any `backgroundColor: '#FEF3C7'` / `'#FDE68A'` (settings planWarning), `'#F5F3FF'` / `'#EFF6FF'` etc. (BaselineMetricsCard) must use the theme's `warningSurface`/`infoSurface` equivalents so the component is readable in dark mode.

---

## Punch-list by Domain

### booking-calendar

| File | Issue | Fix | Priority |
|------|-------|-----|----------|
| `app/(app)/(tabs)/index.tsx` | `ChevButton` is 36×36 — below 44 pt minimum | Add `minHeight: minTouchTarget, minWidth: minTouchTarget` to `chevButton` style | high |
| `app/(app)/(tabs)/index.tsx` | `colVisBtn` is 36×36 | Same as above — use `minTouchTarget` | high |
| `app/(app)/(tabs)/bookings.tsx` | `BulkMessageSheet` uses raw `TextInput` (no `Input` primitive, no label, no animated focus ring) | Replace the `TextInput`+wrapper with `<Input label="Message" multiline …>` | medium |
| `app/(app)/(tabs)/bookings.tsx` | Channel selector pills inside `BulkMessageSheet` roll their own styled `Pressable` — no haptic on mount, inconsistent with `Chip` | Replace with `<Chip>` components (they already fire `hapticSelect`) | medium |
| `app/(app)/(tabs)/bookings.tsx` | `NavButton` is 36×36 | Raise to `minTouchTarget` | high |
| `components/calendar/WeekStrip.tsx` | Day-circle is 34×34 and cell `paddingVertical: spacing.xs` — effective tap area well below 44 pt | Increase `dayCircle` to 40×40 and cell `paddingVertical: spacing.sm` | high |
| `components/calendar/StatusFilterBar.tsx` | No `hapticSelect` when the chip itself is not the `Chip` primitive (it is, so confirm only that `Chip` already fires it) — currently confirmed fine; document in a comment | No code change needed — add inline comment | low |
| `components/calendar/AppointmentBlock.tsx` | Tray action buttons use `paddingVertical: spacing.xs` (4 pt) — far below 44 pt | Set `minHeight: minTouchTarget` on each tray button | high |
| `components/bookings/BookingDetailSheet.tsx` | Sheet header icon buttons (`iconBtn`) have `height: 32` | Raise to `minHeight: minTouchTarget` and use `hitSlop={8}` | high |
| `components/bookings/BookingDetailSheet.tsx` | Sheet title is `<Text variant="label" tone="muted">Booking</Text>` — doesn't follow the standard subheading header pattern | Change to `variant="subheading"` and remove `tone="muted"` | medium |
| `components/bookings/BookingRow.tsx` | Selection checkbox is 22×22 — below minimum | Increase to 24×24 or add `hitSlop={10}` | medium |
| `components/bookings/BookingDetailContent.tsx` | `GuestHistoryCard` expand chevron uses Unicode `'▾'`/`'›'` with `variant="title"` — looks heavy and is not theme-aware | Replace with `SymbolView` chevron, size 16, `tintColor={colors.textMuted}` | low |
| `components/bookings/BookingSortSheet.tsx` | Sort option rows lack explicit `minHeight` | Add `minHeight: minTouchTarget` | medium |

### contacts

| File | Issue | Fix | Priority |
|------|-------|-----|----------|
| `app/(app)/(tabs)/clients.tsx` | `GuestRow` uses `borderWidth: StyleSheet.hairlineWidth` normally and `borderWidth: 1` when selected — the visual pop is inconsistent on Android (hairline renders differently); no press spring animation | Standardise to `borderWidth: 1` always (hair-thin selected border reads poorly) and add a `Pressable` spring via `useSharedValue` like `BookingRow` does | low |
| `app/(app)/(tabs)/clients.tsx` | Bulk bar "–Tag" button label is cryptic | Rename to "Remove tag" | medium |
| `app/(app)/(tabs)/clients.tsx` | Selection checkbox is 22×22 | Raise to `width: 24, height: 24` | medium |
| `app/(app)/(tabs)/clients.tsx` | `refreshControl` on FlatList does not pass `tintColor={colors.brand}` | Add `tintColor={colors.brand}` | low |
| `app/(app)/client/[id].tsx` | `StatTile` uses `borderRadius` implicitly from `colors.surface`/`colors.border` background with no explicit `borderRadius` | Add `borderRadius: radius.md` to `statTile` style | low |
| `app/(app)/client/[id].tsx` | History rows inside `client/[id]` use hard-coded `borderBottomColor: colors.border` on each row Pressable but no `minHeight` | Add `minHeight: minTouchTarget` | high |
| `components/clients/CreateContactSheet.tsx` | Sheet has no explicit header row (no `<Text variant="subheading">` title before the inputs) | Add `<Text variant="subheading">New {clientNoun}</Text>` as the first child | medium |
| `components/clients/ContactFilterSheet.tsx` | Sheet has no title row | Add `<Text variant="subheading">Filter contacts</Text>` as first child after drag handle | medium |
| `components/clients/BulkActionSheets.tsx` | Not reviewed in detail — confirm all sheets have subheading titles | Audit on next pass | low |

### manage

| File | Issue | Fix | Priority |
|------|-------|-----|----------|
| `app/(app)/(tabs)/settings.tsx` | `TILE` colour map uses 10 raw hex values that are not theme-aware; in dark mode the icon tiles are still full-saturation light-mode colours | Add these as a local `const TILE` that maps to `useTheme()` variants where possible, or accept them as fixed decorative hues but document that they are intentionally not theme-tokens | low |
| `app/(app)/(tabs)/settings.tsx` | `planWarning` banner uses `backgroundColor: '#FEF3C7'` and `borderColor: '#FDE68A'` — both are light-mode Tailwind amber which renders wrong in dark mode | Replace with `colors.warningSurface` / `colors.warning` (already in theme) | high |
| `app/(app)/(tabs)/settings.tsx` | Plan warning text uses `color="#78350F"` and `"#92400E"` — hardcoded amber-brown | Replace with `colors.warning` (or define a `warningText` token) | high |
| `app/(app)/manage/services.tsx` | Service colour picker uses 10 hardcoded hex swatches — these are intentional product colours, not theme tokens, but there is no `selected` ring in dark mode (ring uses `borderColor: 'transparent'` vs `colors.text`) | When selected, use `borderColor: colors.text` (2 pt) instead of `borderColor: 'transparent'`; selected swatch check-mark should use `colors.background` | medium |
| `app/(app)/manage/services.tsx` | No `<RefreshControl>` on the services `ScrollView` | Add `<RefreshControl refreshing={servicesQuery.isRefetching} onRefresh={…} tintColor={colors.brand}>` | medium |
| `app/(app)/manage/hours.tsx` | No `<RefreshControl>` on the hours `ScrollView` | Same pattern | medium |
| `app/(app)/manage/hours.tsx` | No `<DetailSkeleton>` / `<ListSkeleton>` during initial venue load | Show `<DetailSkeleton>` when `isLoading` | medium |
| `app/(app)/manage/booking-settings.tsx` | No pull-to-refresh | Add `<RefreshControl>` | medium |
| `app/(app)/manage/communications.tsx` | No pull-to-refresh on the policies `ScrollView` | Add `<RefreshControl>` | medium |
| `app/(app)/manage/communications.tsx` | `HoursStepper` step buttons have `minHeight: minTouchTarget` ✓ but are only 20 pt wide — too narrow | Add `minWidth: minTouchTarget` | high |
| `app/(app)/manage/venue-profile.tsx` | No `<DetailSkeleton>` during initial load (renders empty form) | Wrap the loading branch in `<DetailSkeleton>` | medium |
| `app/(app)/manage/plan.tsx` | Step-line colour `#E2E8F0` is a hardcoded light-mode border | Replace with `colors.border` | high |
| `app/(app)/manage/team.tsx` | No pull-to-refresh on staff list `ScrollView` | Add `<RefreshControl>` | medium |
| `components/manage/OpeningHoursEditor.tsx` | TimeStepper `stepBtn` `borderRadius: 12` — raw number | Replace with `radius.md` | low |
| `components/manage/InviteStaffSheet.tsx` | Calendar assignment chips use `borderRadius: 12` raw | Replace with `radius.md` | low |
| `components/manage/StaffMemberSheet.tsx` | Tab bar uses `borderRadius: 12` raw | Replace with `radius.md` | low |
| `components/manage/PlanChangeTierSheet.tsx` | Tier card uses `borderRadius: 12` raw | Replace with `radius.card` | low |
| `components/compliance/ComplianceFlagBadge.tsx` | `fontWeight: '600'` on badge text | Replace with `fontFamily: fonts.semibold` | medium |

### workspace

| File | Issue | Fix | Priority |
|------|-------|-----|----------|
| `app/(app)/today.tsx` | `SetupChecklistCard` uses Unicode `'✓'` and `'○'` characters rendered with `colors.success`/`colors.textMuted` — low visual fidelity | Replace with `SymbolView` checkmark/circle icons at 14 pt for crispness | low |
| `components/today/GreetingHeader.tsx` | Overline style applied by spreading custom `style` with `textTransform: 'uppercase'` + `letterSpacing` — duplicates what `variant="overline"` already does | Replace `<Text variant="caption" style={styles.overline}>` with `<Text variant="overline">` and delete the `overline` style block | medium |
| `components/today/AlertsCard.tsx` | Uses Unicode `'⚠'` and `'ℹ'` icon characters — renders differently across OS/fonts | Replace with `SymbolView` (`exclamationmark.triangle.fill` / `info.circle.fill`) at 16 pt | medium |
| `components/today/AlertsCard.tsx` | `borderRadius: 12` raw number | Replace with `radius.card` | low |
| `components/today/CapacityCard.tsx` | `borderRadius: 12` raw number (fill bar) | Replace with `radius.sm` (it's an inner progress bar end-cap) | low |
| `components/today/DiarySection.tsx` | `styles.eyebrow` renders `DIARY` as a plain `caption` + manual `style={styles.eyebrow}` — but `styles.eyebrow` is defined inline; check it matches `overline` variant | Replace with `<Text variant="overline">` | medium |
| `app/(app)/waitlist.tsx` | `STATUS_STRIP_COLOR` map uses 5 raw hex values | Extract to a helper that maps to theme tokens where possible (`colors.warning`, `colors.brand`, `colors.success`, `colors.textMuted`, `colors.danger`) | medium |
| `app/(app)/waitlist.tsx` | No `<EmptyState>` for the "Alerts" sub-tab when there are zero alerts | Add `<EmptyState title="No alerts" message="Slot alerts will appear here." />` | low |
| `app/(app)/reports.tsx` | Uses `TouchableOpacity` throughout (12 instances) | Replace every `TouchableOpacity` with `Pressable` using `({ pressed }) => [style, { opacity: pressed ? 0.7 : 1 }]` | high |
| `app/(app)/reports.tsx` | `styles.stepLine` `backgroundColor: '#E2E8F0'` | Replace with `colors.border` | high |
| `app/(app)/reports.tsx` | `styles.barBg` and date-chip styles use `colors.border` ✓ but `styles.barFill` colour is passed as a string arg — fine, but `DateChip` has no `minHeight` | Add `minHeight: minTouchTarget` to `dateChip` | high |
| `components/reports/BaselineMetricsCard.tsx` | Violet `#F5F3FF`/`#DDD6FE` and Blue `#EFF6FF`/`#BFDBFE` surface pairs are hardcoded light-mode colours | Add `violetSurface`/`violetBorder` and `blueSurface`/`blueBorder` to `lightColors`/`darkColors` in `theme/index.ts`, or map to `infoSurface`/`brandSubtle` | medium |
| `app/(app)/notifications.tsx` | Pull-to-refresh passes `tintColor={colors.brand}` ✓; `NotificationRow` minimum height is 44 ✓; good overall — no action needed | — | — |
| `app/(app)/availability.tsx` | Stepper buttons `height: 44` ✓ but `width` is not constrained — on small screens they can shrink below 44 pt | Add `minWidth: minTouchTarget` | medium |

### shared

| File | Issue | Fix | Priority |
|------|-------|-----|----------|
| `components/ui/EmptyState.tsx` | Uses raw RN `<Text>` with spread `typography.*` | Replace both `Text` nodes with `<Text variant="heading">` and `<Text variant="bodySmall" tone="secondary">` from the UI primitive | high |
| `components/ui/ErrorState.tsx` | Same raw RN `<Text>` issue | Same fix as EmptyState | high |
| `components/ui/LoadingState.tsx` | Raw RN `<Text>` with spread `typography.bodySmall` | Replace with `<Text variant="bodySmall" tone="secondary">` | high |
| `components/ui/LinkedVenueBanner.tsx` | Raw RN `<Text>` with `typography.caption` spread; `fontWeight: '600'` on link text | Replace with `<Text variant="caption">` and `<Text variant="bodySmall">` + drop `fontWeight` (use `fonts.semibold` family in a `Text` `style` prop if bold weight needed, or just use `variant="label"`) | high |
| `app/(app)/staff-required.tsx` | Raw RN `<Text>` throughout | Replace with themed `<Text variant="title">`, `<Text variant="body" tone="secondary">`, `<Text variant="bodySmall" tone="secondary">` | medium |
| `components/ui/Button.tsx` | Label uses raw RN `<Text>` with inline `{ color: v.text, fontSize: sizing.fontSize }` — breaks from the themed primitive pattern | This is intentional internal styling of the Button primitive; acceptable — but add a TODO comment so it's not mistaken for an oversight | low |
| `components/ui/EmptyState.tsx` | No illustration/icon — the empty state is text-only which reads as an error to users | Add an optional `icon?: ReactNode` prop and render it centred above the title; call sites that have obvious icons (calendar, contacts) can pass a `SymbolView` | medium |
| `components/ui/Screen.tsx` | Non-scroll variant wraps content in a bare `<View>` — keyboard-avoiding is left entirely to each screen | Add an optional `keyboardAvoiding` prop that wraps the inner View in `<KeyboardAvoidingView behavior="padding">` | medium |
| `theme/index.ts` | No `violetSurface`/`violetBorder` or `blueSurface`/`blueBorder` tokens needed by `BaselineMetricsCard` | Add to `lightColors`/`darkColors` | medium |
