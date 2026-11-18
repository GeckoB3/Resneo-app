/**
 * Manage collective, Settings (web Docs/card-on-file-plan.md §21, D27; web `CollectiveSettingsPanel`).
 *
 * One place that answers "what applies to all of us?". The booking rules are a true second view of
 * the collective's own settings: the same store as Settings, Booking settings, saved through the
 * same routes with the same version check. The page, the host's details and Clients are summaries
 * with links to where they are edited; the last part says what each business sets for itself.
 * The host edits; members read plain values, never greyed-out switches (amendment 2). The section
 * is obviously collective-wide, so saves here ask no question (amendment 3), only the line at the
 * top says so.
 */
import * as Clipboard from 'expo-clipboard';
import { useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  COLLECTIVE_RULE_ROWS,
  WAITLIST_MODE_TITLES,
  settingsCopy,
  type CollectiveRuleKey,
} from '@/lib/collective-area/settings-copy';
import { getWebUrl } from '@/lib/env';
import { hapticSuccess, hapticTap, hapticWarning } from '@/lib/haptics';
import {
  isStaleCollectiveSave,
  useCollectiveSettings,
  useSaveCollectiveRule,
  type CollectiveRuleSave,
  type CollectiveSettingsPayload,
} from '@/lib/queries/useCollectiveSettings';
import { useWebDashboardLink } from '@/lib/sites/useWebDashboardLink';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * The app screen for a web settings link the payload names (`COLLECTIVE_SETTINGS_LINKS` on the
 * web), or null when the app has none and the web dashboard opens instead.
 */
const APP_ROUTE_FOR_WEB_HREF: Record<string, string> = {
  '/dashboard/settings?tab=booking-page': '/manage/booking-page',
  '/dashboard/settings?tab=profile': '/manage/venue-profile',
  '/dashboard/settings?tab=business-hours': '/manage/hours',
  '/dashboard/settings?tab=payments': '/manage/plan',
  '/dashboard/settings?tab=comms': '/manage/communications',
  '/dashboard/compliance-types': '/manage/compliance-settings',
  '/dashboard/settings?tab=booking-settings': '/manage/booking-settings',
};

export function appRouteForSettingsHref(href: string): string | null {
  return APP_ROUTE_FOR_WEB_HREF[href] ?? null;
}

const WAITLIST_MODE_ORDER = ['staff_choose', 'notify_in_order', 'notify_all'] as const;

export function SettingsPanel({
  collectiveId,
  onOpenClients,
}: {
  collectiveId: string;
  /** "Open Clients": the area's own Clients section. */
  onOpenClients: () => void;
}) {
  const settings = useCollectiveSettings(collectiveId);

  if (settings.isLoading) {
    return (
      <Text variant="bodySmall" tone="muted">
        Loading the settings...
      </Text>
    );
  }
  if (settings.isError) {
    return (
      <Card>
        <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
          {settings.error instanceof ApiError ? settings.error.message : settingsCopy('set.loadError')}
        </Text>
        <Button label="Try again" variant="secondary" size="sm" onPress={() => void settings.refetch()} />
      </Card>
    );
  }
  if (!settings.data) {
    // A server from before the section.
    return (
      <Card>
        <Text variant="bodySmall" tone="secondary" testID="collective-settings-unavailable">
          {settingsCopy('set.unavailable')}
        </Text>
      </Card>
    );
  }

  const data = settings.data;
  return (
    <View style={styles.stack} testID="collective-settings-panel">
      {data.collective.is_host ? (
        <Text variant="bodySmall" tone="secondary" testID="collective-settings-top">
          {data.top_line}
        </Text>
      ) : null}
      <BookingRulesPart data={data} collectiveId={collectiveId} />
      <CollectivePagePart data={data} />
      <HostDetailsPart data={data} />
      {data.clients ? <ClientsPart clients={data.clients} onOpenClients={onOpenClients} /> : null}
      <NoShowPart data={data} />
      <PerBusinessPart data={data} />
    </View>
  );
}

/** Open a payload link: the app's own screen when it has one, else the web dashboard. */
function useOpenSettingsLink() {
  const router = useRouter();
  const toast = useToast();
  const siteLink = useWebDashboardLink();
  return (href: string) => {
    const route = appRouteForSettingsHref(href);
    if (route) {
      router.push(route as Href);
      return;
    }
    const url = `${(getWebUrl() || 'https://app.resneo.com').replace(/\/$/, '')}${siteLink(href)}`;
    void WebBrowser.openBrowserAsync(url).catch(() =>
      Linking.openURL(url).catch(() => toast.error('Could not open the browser.')),
    );
  };
}

function PartTitle({ children }: { children: string }) {
  return (
    <Text variant="label" accessibilityRole="header">
      {children}
    </Text>
  );
}

function LinkButton({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={8}
      style={styles.link}>
      <Text variant="label" tone="brand">
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// 1. Booking rules
// ---------------------------------------------------------------------------

function BookingRulesPart({ data, collectiveId }: { data: CollectiveSettingsPayload; collectiveId: string }) {
  const { colors } = useTheme();
  const rules = data.booking_rules;
  const save = useSaveCollectiveRule(collectiveId);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const host = data.collective.host_venue_name;
  const saving = save.isPending;

  const run = (input: Omit<CollectiveRuleSave, 'version'>) => {
    setMessage(null);
    save.mutate({ ...input, version: rules.version } as CollectiveRuleSave, {
      onSuccess: () => {
        hapticSuccess();
        setMessage({ tone: 'success', text: settingsCopy('set.saved', { collective: data.collective.name }) });
      },
      onError: (err) => {
        hapticWarning();
        // Someone else saved first: the settings are read again, and the server's words say so.
        setMessage({
          tone: 'danger',
          text:
            isStaleCollectiveSave(err) || err instanceof ApiError
              ? err.message
              : settingsCopy('set.saveError'),
        });
      },
    });
  };

  const toggle = (key: CollectiveRuleKey) => {
    hapticTap();
    const next = !rules.resolved[key];
    if (key === 'require_account_login') {
      run({ route: 'venue', patch: { require_account_login_for_bookings: next } });
      return;
    }
    const patch: Record<string, unknown> = { [key]: next };
    if (next && key === 'waitlist_v2') patch.waitlist_config = { mode: rules.waitlist_mode };
    run({ route: 'feature-flags', patch });
  };

  const config = rules.any_available_practitioner_config;
  const order = orderedCalendars(rules.calendars, config.calendar_order);
  const saveAnyAvailable = (mode: 'priority' | 'random', calendarOrder: string[]) =>
    run({
      route: 'feature-flags',
      patch: { any_available_practitioner: true, any_available_practitioner_config: { mode, calendar_order: calendarOrder } },
    });
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    hapticTap();
    const ids = order.map((c) => c.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    saveAnyAvailable('priority', ids);
  };

  return (
    <Card>
      <View style={styles.part}>
        <PartTitle>{settingsCopy('set.rules.title')}</PartTitle>
        {!data.collective.is_host ? (
          <Text variant="bodySmall" tone="secondary" testID="collective-settings-set-by">
            {settingsCopy('set.member.top', { host })}
          </Text>
        ) : !data.can_edit ? (
          <Text variant="bodySmall" tone="secondary">
            {settingsCopy('set.rules.notLive', { collective: data.collective.name })}
          </Text>
        ) : null}
        {message ? (
          <Text
            variant="bodySmall"
            tone={message.tone}
            accessibilityRole={message.tone === 'danger' ? 'alert' : undefined}
            accessibilityLiveRegion="polite"
            testID="collective-settings-message">
            {message.text}
          </Text>
        ) : null}

        {data.can_edit ? (
          <View>
            {COLLECTIVE_RULE_ROWS.map(({ key, title }, index) => (
              <View
                key={key}
                style={[styles.ruleRow, index > 0 ? [styles.divider, { borderTopColor: colors.border }] : null]}
                testID={`collective-rule-${key}`}>
                <View style={styles.ruleHead}>
                  <Text variant="bodyMedium" style={styles.flex1}>
                    {title}
                  </Text>
                  <Switch
                    value={rules.resolved[key]}
                    onValueChange={() => toggle(key)}
                    disabled={saving}
                    accessibilityLabel={title}
                    trackColor={{ true: colors.brand }}
                  />
                </View>
                {key === 'waitlist_v2' && rules.resolved.waitlist_v2 ? (
                  <View style={styles.subPanel}>
                    <Text variant="caption" tone="secondary">
                      When a slot opens
                    </Text>
                    {WAITLIST_MODE_ORDER.map((mode) => (
                      <Choice
                        key={mode}
                        label={WAITLIST_MODE_TITLES[mode]}
                        selected={rules.waitlist_mode === mode}
                        disabled={saving}
                        onPress={() =>
                          run({ route: 'feature-flags', patch: { waitlist_v2: true, waitlist_config: { mode } } })
                        }
                      />
                    ))}
                  </View>
                ) : null}
                {key === 'any_available_practitioner' && rules.resolved.any_available_practitioner ? (
                  <View style={styles.subPanel}>
                    <Text variant="caption" tone="secondary">
                      Who gets the booking?
                    </Text>
                    <Choice
                      label="Priority order"
                      selected={config.mode === 'priority'}
                      disabled={saving}
                      onPress={() => saveAnyAvailable('priority', order.map((c) => c.id))}
                    />
                    <Choice
                      label="Random"
                      selected={config.mode === 'random'}
                      disabled={saving}
                      onPress={() => saveAnyAvailable('random', order.map((c) => c.id))}
                    />
                    {config.mode === 'priority' && order.length > 0 ? (
                      <View style={styles.order}>
                        {order.map((cal, i) => (
                          <View key={cal.id} style={[styles.orderRow, { borderColor: colors.border }]}>
                            <Text variant="bodySmall" numberOfLines={1} style={styles.flex1}>
                              {`${i + 1}. ${cal.name}${cal.venue_name ? ` at ${cal.venue_name}` : ''}`}
                            </Text>
                            <IconButton
                              icon={{ ios: 'chevron.up', android: 'keyboard_arrow_up', web: 'keyboard_arrow_up' }}
                              variant="bordered"
                              size={44}
                              iconSize={18}
                              disabled={saving || i === 0}
                              onPress={() => move(i, -1)}
                              accessibilityLabel={`Move ${cal.name} up`}
                            />
                            <IconButton
                              icon={{ ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' }}
                              variant="bordered"
                              size={44}
                              iconSize={18}
                              disabled={saving || i === order.length - 1}
                              onPress={() => move(i, 1)}
                              accessibilityLabel={`Move ${cal.name} down`}
                            />
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <View testID="collective-rules-read-only" style={styles.readOnly}>
            {memberRuleLines(data).map((line) => (
              <Text key={line} variant="bodySmall">
                {line}
              </Text>
            ))}
          </View>
        )}
      </View>
    </Card>
  );
}

/** A member's (or a not-yet-live host's) plain values: "Require sign-in to book: Off". */
export function memberRuleLines(data: CollectiveSettingsPayload): string[] {
  const rules = data.booking_rules;
  const lines: string[] = [];
  for (const { key, title } of COLLECTIVE_RULE_ROWS) {
    const on = Boolean(rules.resolved[key]);
    lines.push(`${title}: ${settingsCopy(on ? 'set.on' : 'set.off')}`);
    if (key === 'waitlist_v2' && on) {
      lines.push(
        settingsCopy('set.rules.waitlistMode', { mode: WAITLIST_MODE_TITLES[rules.waitlist_mode] ?? rules.waitlist_mode }),
      );
    }
    if (key === 'any_available_practitioner' && on) {
      lines.push(
        settingsCopy(rules.any_available_practitioner_config.mode === 'random' ? 'set.rules.anyRandom' : 'set.rules.anyPriority'),
      );
    }
  }
  return lines;
}

function orderedCalendars(
  calendars: CollectiveSettingsPayload['booking_rules']['calendars'],
  savedOrder: string[],
) {
  const byId = new Map(calendars.map((c) => [c.id, c]));
  const out = savedOrder.map((id) => byId.get(id)).filter((c): c is (typeof calendars)[number] => Boolean(c));
  for (const c of calendars) if (!savedOrder.includes(c.id)) out.push(c);
  return out;
}

function Choice({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        if (!selected) onPress();
      }}
      style={styles.choice}>
      <View
        style={[
          styles.radio,
          { borderColor: selected ? colors.brand : colors.borderStrong, backgroundColor: selected ? colors.brand : 'transparent' },
        ]}
      />
      <Text variant="bodySmall">{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// 2. Collective page
// ---------------------------------------------------------------------------

function CollectivePagePart({ data }: { data: CollectiveSettingsPayload }) {
  const toast = useToast();
  const openLink = useOpenSettingsLink();
  const page = data.page;
  const address = `${(getWebUrl() || 'https://app.resneo.com').replace(/\/$/, '')}${page.path}`;
  return (
    <Card>
      <View style={styles.part}>
        <PartTitle>{settingsCopy('set.page.title')}</PartTitle>
        <Text variant="bodySmall" tone="secondary">
          {page.public_name_line}
        </Text>
        <Text variant="bodySmall" selectable testID="collective-settings-address">
          {address}
        </Text>
        <View style={styles.row}>
          <Button
            label={settingsCopy('set.page.copy')}
            variant="secondary"
            size="sm"
            onPress={() => {
              void Clipboard.setStringAsync(address).then(() => toast.success(settingsCopy('set.page.copied')));
            }}
          />
          <Button
            label={settingsCopy('set.page.open')}
            variant="secondary"
            size="sm"
            accessibilityLabel={`Open the ${page.public_name} page`}
            onPress={() => {
              void WebBrowser.openBrowserAsync(address).catch(() =>
                Linking.openURL(address).catch(() => toast.error('Could not open the browser.')),
              );
            }}
          />
        </View>
        {page.look.lines.map((line) => (
          <Text key={line} variant="bodySmall">
            {line}
          </Text>
        ))}
        {page.edit_href ? (
          <Button
            label={settingsCopy('set.page.edit')}
            variant="secondary"
            size="sm"
            style={styles.alignStart}
            onPress={() => openLink(page.edit_href!)}
          />
        ) : null}
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. From {host}'s own details
// ---------------------------------------------------------------------------

function HostDetailsPart({ data }: { data: CollectiveSettingsPayload }) {
  const openLink = useOpenSettingsLink();
  const details = data.host_details;
  return (
    <Card>
      <View style={styles.part}>
        <PartTitle>{details.title}</PartTitle>
        <Text variant="bodySmall" tone="secondary">
          {details.body}
        </Text>
        {details.lines.map((line) => (
          <Text key={line} variant="bodySmall">
            {line}
          </Text>
        ))}
        {details.links ? (
          <View style={styles.row}>
            <LinkButton label={settingsCopy('set.hostDetails.profile')} onPress={() => openLink(details.links!.profile)} />
            <LinkButton
              label={settingsCopy('set.hostDetails.businessHours')}
              onPress={() => openLink(details.links!.business_hours)}
            />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Clients
// ---------------------------------------------------------------------------

function ClientsPart({
  clients,
  onOpenClients,
}: {
  clients: NonNullable<CollectiveSettingsPayload['clients']>;
  onOpenClients: () => void;
}) {
  return (
    <Card>
      <View style={styles.part}>
        <PartTitle>{settingsCopy('set.clients.title')}</PartTitle>
        <Text variant="bodySmall" testID="collective-settings-clients">
          {clients.line}
        </Text>
        <Button
          label={settingsCopy('set.clients.open')}
          variant="secondary"
          size="sm"
          style={styles.alignStart}
          onPress={onOpenClients}
        />
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 5. No-show protection
// ---------------------------------------------------------------------------

function NoShowPart({ data }: { data: CollectiveSettingsPayload }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <View style={styles.part}>
        <PartTitle>{data.no_show.title}</PartTitle>
        <Text variant="bodySmall">{data.no_show.line}</Text>
        <Text variant="caption" tone="muted">
          {settingsCopy('set.noShow.nothingToSet')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((o) => !o)}
          hitSlop={8}
          style={styles.link}>
          <Text variant="label" tone="brand">
            {settingsCopy(open ? 'set.noShow.hideMembers' : 'set.noShow.members')}
          </Text>
        </Pressable>
        {open ? (
          <View testID="collective-settings-members">
            {data.no_show.members.map((m) => (
              <Text key={m.venue_id} variant="bodySmall">
                {m.is_host ? settingsCopy('set.noShow.host', { venue: m.venue_name }) : m.venue_name}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 6. Set by each business (amendment 1)
// ---------------------------------------------------------------------------

function PerBusinessPart({ data }: { data: CollectiveSettingsPayload }) {
  const { colors } = useTheme();
  const openLink = useOpenSettingsLink();
  const own = data.per_business;
  return (
    <Card>
      <View style={styles.part}>
        <PartTitle>{settingsCopy('set.each.title')}</PartTitle>
        <Text variant="bodySmall" tone="secondary">
          {own.body}
        </Text>
        <View testID="collective-settings-per-business">
          {own.items.map((item, index) => (
            <View
              key={item.key}
              style={[styles.itemRow, index > 0 ? [styles.divider, { borderTopColor: colors.border }] : null]}>
              <Text variant="bodySmall" style={styles.flex1}>
                {`${item.label}: ${item.value}`}
              </Text>
              <LinkButton
                label={settingsCopy('set.each.open')}
                accessibilityLabel={`${settingsCopy('set.each.open')} ${item.label}`}
                onPress={() => openLink(item.href)}
              />
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  part: { gap: spacing.sm },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  alignStart: { alignSelf: 'flex-start' },
  link: { minHeight: 44, justifyContent: 'center' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  ruleRow: { paddingVertical: spacing.sm, gap: spacing.sm },
  ruleHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  subPanel: { gap: spacing.xs, paddingLeft: spacing.sm },
  choice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  order: { gap: spacing.xs },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingLeft: spacing.sm,
  },
  readOnly: { gap: spacing.xs },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
});
