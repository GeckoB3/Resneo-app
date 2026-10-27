import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';

import { ChoiceRow } from '@/components/linked/setup/ChoiceRow';
import { StepShell } from '@/components/linked/setup/StepShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { getWebUrl } from '@/lib/env';
import { formatPence } from '@/lib/format';
import { formatVenueList, setupCopy } from '@/lib/linked/setup-copy';
import { areaCopy } from '@/lib/collective-area/copy';
import type { BulkOp, CollectiveCalendarGroup } from '@/lib/collective-area/model';
import { venueServiceKey, type CurateItem, type VenueServicesGroup } from '@/lib/collective-area/venue-services';
import { useCollectiveBulkSave } from '@/lib/queries/useCollectiveArea';
import { useCurateServices, useVenueServices } from '@/lib/queries/useCollectiveCurate';
import { useCollectives, useSameNames } from '@/lib/queries/useCollectives';
import { useCreateService, useManagedServices } from '@/lib/queries/useServicesManage';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ManagedService } from '@/types/services-manage';

/**
 * Finish setting up a collective (web `CollectiveSetupWizard.tsx`; plan L8 to L10).
 *
 * The other venue is in; the page is not live. This walks the host through the two things that
 * make it live: which of its services go on the page, and which calendars, at each venue, offer
 * them. Two saves, because a member's calendar cannot offer a service until its copy is applied
 * (L9). A host with no services adds one here (L10).
 *
 * Since 2026-10-27 the services step lists every venue's own services, not only the host's: a
 * member's goes on the page as it is, keeping its calendars, with nobody asked. They are ticked
 * when not on the page and bookable online, and saved through the venue-services route after the
 * host's own. A server without that route (it answers 404) shows the host's services alone.
 */

type Step = 'intro' | 'services' | 'calendars' | 'done';

const cellKey = (serviceId: string, venueId: string, calendarId: string) => `${serviceId}:${venueId}:${calendarId}`;

/** The host's own active services: what can go on the page. Copies from another collective never appear here. */
function hostServices(services: readonly ManagedService[]): ManagedService[] {
  return services.filter((s) => s.is_active !== false && s.collective?.role !== 'replica' && s.collective?.role !== 'retired');
}

/** A venue can take calendar choices for a service once its copy of it is applied (the host always can). */
function venueReady(group: CollectiveCalendarGroup, itemId: string): boolean {
  if (group.is_host) return true;
  if ((group.awaiting_answer ?? []).includes(itemId)) return true;
  if (group.sync.pending.some((p) => p.venue_id === group.venue_id)) return false;
  if (group.sync.failed.some((f) => f.venue_id === group.venue_id)) return false;
  return true;
}

export function CollectiveSetupSheet({
  visible,
  collectiveId,
  venueName,
  onClose,
  onChanged,
}: {
  visible: boolean;
  collectiveId: string | null;
  venueName: string;
  onClose: () => void;
  /** Called after each save, so the screen behind can refresh. */
  onChanged?: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const servicesQuery = useManagedServices();
  const collectivesQuery = useCollectives({ enabled: visible });
  const sameNamesQuery = useSameNames(collectiveId, { enabled: visible });
  const save = useCollectiveBulkSave(collectiveId);
  const create = useCreateService();
  const venueServicesQuery = useVenueServices(collectiveId, visible);
  const curate = useCurateServices(collectiveId);

  const [step, setStep] = useState<Step>('intro');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  /** Members' own services ticked for the page, by `venue:service`. */
  const [memberSelected, setMemberSelected] = useState<ReadonlySet<string>>(new Set());
  const [membersSeeded, setMembersSeeded] = useState(false);
  const [cells, setCells] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<null | 'services' | 'calendars' | 'adding'>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMinutes, setNewMinutes] = useState('60');
  const [newPrice, setNewPrice] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep('intro');
    setSeeded(false);
    setSelected(new Set());
    setMembersSeeded(false);
    setMemberSelected(new Set());
    setCells({});
    setBusy(null);
    setNotice(null);
    setError(null);
    setAdding(false);
    setCopied(false);
  }, [visible, collectiveId]);

  const allServices = useMemo(() => servicesQuery.data?.services ?? [], [servicesQuery.data]);
  const groups = useMemo(() => servicesQuery.data?.collective_calendars ?? [], [servicesQuery.data]);
  const links = useMemo(() => servicesQuery.data?.practitioner_services ?? [], [servicesQuery.data]);
  const entry = useMemo(
    () => (collectivesQuery.data?.collectives ?? []).find((c) => c.id === collectiveId) ?? null,
    [collectivesQuery.data, collectiveId],
  );
  const sameNames = sameNamesQuery.data ?? {};
  /** Every venue's own services, or null on a server without them (the host's alone, as before). */
  const venueGroups = useMemo<VenueServicesGroup[] | null>(
    () => (venueServicesQuery.data?.role === 'host' ? venueServicesQuery.data.venues : null),
    [venueServicesQuery.data],
  );
  const services = useMemo(() => {
    // A page service made from a member's service is the member's: it is listed under that venue.
    const hostGroup = venueGroups?.find((g) => g.is_host) ?? null;
    const own = hostGroup ? new Set(hostGroup.services.map((s) => s.id)) : null;
    return hostServices(allServices).filter((s) => !own || own.has(s.id));
  }, [allServices, venueGroups]);
  const memberGroups = useMemo(() => (venueGroups ?? []).filter((g) => !g.is_host), [venueGroups]);
  /** The members' services that will go on the page with this save. */
  const memberPicked = useMemo<CurateItem[]>(
    () =>
      memberGroups.flatMap((g) =>
        g.services
          .filter((s) => !s.on_page && memberSelected.has(venueServiceKey(g.venue_id, s.id)))
          .map((s) => ({ venue_id: g.venue_id, service_id: s.id })),
      ),
    [memberGroups, memberSelected],
  );
  const collectiveName = entry?.name ?? services.find((s) => s.collective)?.collective?.collective_name ?? 'your collective';
  const slug = entry?.slug ?? '';
  const memberNames = useMemo(
    () => (entry?.members ?? []).filter((m) => m.status === 'active' && m.venueId !== entry?.hostVenueId).map((m) => m.venueName),
    [entry],
  );

  // Sensible defaults once the services arrive: what is already on the page, plus everything guests can book online.
  useEffect(() => {
    if (!visible || seeded || servicesQuery.data === undefined) return;
    const initial = new Set<string>();
    for (const s of services) {
      if (s.collective?.role === 'master' || s.is_bookable_online !== false) initial.add(s.id);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(initial);
    setSeeded(true);
  }, [visible, seeded, servicesQuery.data, services]);

  // Members' services too: each venue's goes on the page unless the host unticks it (web 2026-10-27).
  useEffect(() => {
    if (!visible || membersSeeded || venueServicesQuery.data === undefined) return;
    const members = new Set<string>();
    for (const g of memberGroups) {
      for (const s of g.services) if (!s.on_page && s.bookable_online) members.add(venueServiceKey(g.venue_id, s.id));
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMemberSelected(members);
    setMembersSeeded(true);
  }, [visible, membersSeeded, venueServicesQuery.data, memberGroups]);

  const onPage = (s: ManagedService) => s.collective?.role === 'master';
  const selectedServices = services.filter((s) => selected.has(s.id));
  /** The services on the page after the first save, with the item id the calendars are keyed by. */
  const pageServices = useMemo(() => services.filter((s) => onPage(s) && s.collective?.item_id && selected.has(s.id)), [services, selected]);

  // Calendar defaults: what already offers the service (on the page), else, at the host, the calendars
  // that offer it on the venue's own page.
  const seedCells = useCallback(() => {
    const next: Record<string, boolean> = {};
    for (const s of services) {
      const itemId = s.collective?.item_id ?? null;
      for (const group of groups) {
        for (const cal of group.calendars) {
          if (!cal.is_active) continue;
          const assigned = itemId ? cal.assigned.some((a) => a.item_id === itemId) : false;
          const own = group.is_host && links.some((l) => l.practitioner_id === cal.id && l.service_id === s.id);
          next[cellKey(s.id, group.venue_id, cal.id)] = assigned || own;
        }
      }
    }
    setCells(next);
  }, [services, groups, links]);

  const refresh = async () => {
    const [fresh] = await Promise.all([
      servicesQuery.refetch(),
      collectivesQuery.refetch(),
      sameNamesQuery.refetch(),
      venueServicesQuery.refetch(),
    ]);
    onChanged?.();
    return fresh.data ?? null;
  };

  const saveServices = async () => {
    const toOffer = selectedServices.filter((s) => !onPage(s));
    setBusy('services');
    setError(null);
    setNotice(toOffer.length + memberPicked.length > 0 ? setupCopy('finish.services.saving') : null);
    try {
      let failed = 0;
      if (toOffer.length > 0) {
        const results = await save.mutateAsync(toOffer.map((s) => ({ op: 'offer', service_id: s.id }) as BulkOp));
        failed = results.filter((r) => !r.ok).length;
      }
      // Then the members' own: each goes on as it is, joining a page service of the same name. The
      // host's go first, so a member's service of the same name joins the host's rather than
      // becoming a second one. The hook sends them 200 at a time.
      if (memberPicked.length > 0) {
        const outcome = await curate.mutateAsync({ action: 'add', mode: 'match', items: memberPicked });
        if (outcome.refused) throw new ApiError(outcome.refusal ?? 'The save did not go through.', 400);
        failed += outcome.results.filter((r) => !r.ok).length;
      }
      await refresh();
      if (failed > 0) setError(setupCopy('finish.services.failed', { count: failed }));
      setNotice(null);
      setStep('calendars');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The save did not go through.');
      setNotice(null);
    } finally {
      setBusy(null);
    }
  };

  // Seed the calendar cells whenever the calendars step is entered with fresh data.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (step === 'calendars') seedCells();
  }, [step, seedCells]);

  const saveCalendars = async () => {
    const ops: BulkOp[] = [];
    for (const s of pageServices) {
      const itemId = s.collective!.item_id!;
      for (const group of groups) {
        if (!venueReady(group, itemId)) continue;
        if ((group.awaiting_answer ?? []).includes(itemId)) continue;
        for (const cal of group.calendars) {
          if (!cal.is_active) continue;
          const want = cells[cellKey(s.id, group.venue_id, cal.id)] === true;
          const has = cal.assigned.some((a) => a.item_id === itemId);
          if (want && !has) ops.push({ op: 'assign', service_id: s.id, venue_id: group.venue_id, calendar_id: cal.id });
          if (!want && has) ops.push({ op: 'unassign', service_id: s.id, venue_id: group.venue_id, calendar_id: cal.id });
        }
      }
    }
    setBusy('calendars');
    setError(null);
    setNotice(ops.length > 0 ? setupCopy('finish.calendars.saving') : null);
    try {
      const results = ops.length > 0 ? await save.mutateAsync(ops) : [];
      const failed = results.filter((r) => !r.ok).length;
      await refresh();
      if (failed > 0) setError(setupCopy('finish.calendars.failed', { count: failed }));
      setNotice(null);
      setStep('done');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The save did not go through.');
      setNotice(null);
    } finally {
      setBusy(null);
    }
  };

  const addService = async () => {
    const minutes = Number.parseInt(newMinutes, 10);
    const price = newPrice.trim() === '' ? 0 : Math.round(Number.parseFloat(newPrice) * 100);
    if (newName.trim().length === 0 || !Number.isFinite(minutes) || minutes < 5 || !Number.isFinite(price) || price < 0) {
      setError('Give the service a name, a length of at least 5 minutes, and a price.');
      return;
    }
    setBusy('adding');
    setError(null);
    try {
      const data = (await create.mutateAsync({ name: newName.trim(), duration_minutes: minutes, price_pence: price })) as {
        service?: { id?: string };
        id?: string;
      } | null;
      const fresh = await refresh();
      const createdId = data?.service?.id ?? data?.id ?? null;
      const match = fresh
        ? (createdId ? fresh.services.find((s) => s.id === createdId) : fresh.services.find((s) => s.name === newName.trim()))
        : null;
      if (match) setSelected((prev) => new Set([...prev, match.id]));
      toast.success(`${newName.trim()} added.`);
      setNewName('');
      setNewPrice('');
      setAdding(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The service was not added. Please check your connection.');
    } finally {
      setBusy(null);
    }
  };

  const live = useMemo(() => {
    if (!entry) return false;
    const activeCount = entry.members.filter((m) => m.status === 'active').length;
    if (activeCount < 2) return false;
    return groups.some((g) => g.calendars.some((c) => c.is_active && c.assigned.length > 0));
  }, [entry, groups]);

  const steps: Step[] = ['intro', 'services', 'calendars', 'done'];
  const index = steps.indexOf(step);
  const fullAddress = `${getWebUrl()}/book/c/${slug}`;
  const loading = servicesQuery.isLoading || collectivesQuery.isLoading;
  const loadError = servicesQuery.isError ? 'Could not load your services. Please check your connection and try again.' : null;

  const footer =
    step === 'done' ? (
      <Button label={setupCopy('finish.done.close')} onPress={onClose} />
    ) : (
      <>
        {step === 'calendars' ? <Button label={setupCopy('finish.cta.back')} variant="secondary" disabled={busy !== null} onPress={() => setStep('services')} /> : null}
        {step === 'services' ? <Button label={setupCopy('finish.cta.back')} variant="secondary" disabled={busy !== null} onPress={() => setStep('intro')} /> : null}
        <Button label={setupCopy('finish.cta.later')} variant="ghost" disabled={busy !== null} onPress={onClose} />
        {step === 'intro' ? (
          <Button label={setupCopy('finish.cta.next')} disabled={loading || Boolean(loadError)} onPress={() => setStep('services')} />
        ) : step === 'services' ? (
          <Button
            label={setupCopy('finish.cta.save')}
            disabled={busy !== null || selectedServices.length + memberPicked.length === 0}
            loading={busy === 'services'}
            onPress={() => void saveServices()}
          />
        ) : (
          <Button label={setupCopy('finish.cta.save')} disabled={busy !== null} loading={busy === 'calendars'} onPress={() => void saveCalendars()} />
        )}
      </>
    );

  return (
    <StepShell
      visible={visible}
      onClose={() => {
        if (busy === null) onClose();
      }}
      title={
        step === 'done'
          ? live
            ? setupCopy('finish.done.title', { collective: collectiveName })
            : setupCopy('finish.done.notLive.title', { collective: collectiveName })
          : setupCopy('finish.title', { collective: collectiveName })
      }
      step={step === 'done' ? undefined : index + 1}
      total={step === 'done' ? undefined : 3}
      error={error ?? loadError}
      notice={notice}
      footer={footer}>
      {step === 'intro' ? (
        <View style={styles.section}>
          <Text variant="bodyMedium">{setupCopy('finish.intro.heading', { venueList: formatVenueList(memberNames, 3) || 'Your partner venue' })}</Text>
          <Text variant="bodySmall" tone="secondary">
            {setupCopy('finish.intro.body', { collective: collectiveName })}
          </Text>
          <View style={[styles.infoCard, { backgroundColor: colors.brandSubtle }]}>
            <Text variant="caption" tone="secondary">
              {setupCopy('finish.intro.owns')}
            </Text>
          </View>
          {loading ? (
            <Text variant="caption" tone="muted">
              Loading...
            </Text>
          ) : null}
        </View>
      ) : null}

      {step === 'services' ? (
        <View style={styles.section}>
          <Text variant="bodyMedium">{setupCopy('finish.services.heading')}</Text>
          <Text variant="caption" tone="secondary">
            {setupCopy('finish.services.help', { collective: collectiveName })}
          </Text>
          {memberGroups.length > 0 ? (
            <Text variant="overline" tone="secondary" accessibilityRole="header">
              {setupCopy('finish.services.yours')}
            </Text>
          ) : null}
          {services.length === 0 && !adding ? (
            <View style={[styles.infoCard, { borderColor: colors.border, borderWidth: 1 }]}>
              <Text variant="bodyMedium">{setupCopy('finish.services.none.title')}</Text>
              <Text variant="caption" tone="secondary">
                {setupCopy('finish.services.none.body')}
              </Text>
              <Button label={setupCopy('finish.services.add')} size="sm" onPress={() => setAdding(true)} />
            </View>
          ) : (
            services.map((s) => {
              const already = onPage(s);
              const matches = sameNames[s.id] ?? [];
              const price = s.price_pence != null ? (formatPence(s.price_pence) ?? `£${(s.price_pence / 100).toFixed(2)}`) : null;
              return (
                <ChoiceRow
                  key={s.id}
                  kind="checkbox"
                  selected={selected.has(s.id)}
                  disabled={already}
                  title={s.name}
                  summary={[s.duration_minutes ? `${s.duration_minutes} min` : null, price].filter(Boolean).join(' · ') || null}
                  note={
                    !already && matches.length > 0
                      ? setupCopy('finish.services.sameName', { venueList: formatVenueList(matches.map((m) => m.venue_name), 2), service: s.name })
                      : null
                  }
                  onPress={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(s.id)) next.delete(s.id);
                      else next.add(s.id);
                      return next;
                    })
                  }>
                  <View style={styles.badges}>
                    {already ? <Badge label={setupCopy('finish.services.onPage')} tone="brand" /> : null}
                    {s.is_bookable_online === false ? <Badge label={setupCopy('finish.services.staffOnly')} /> : null}
                  </View>
                </ChoiceRow>
              );
            })
          )}
          {adding ? (
            <View style={[styles.infoCard, { borderColor: colors.brandBorder, borderWidth: 1 }]}>
              <Input label={setupCopy('finish.services.add.name')} value={newName} maxLength={200} autoFocus onChangeText={setNewName} />
              <Input label={setupCopy('finish.services.add.duration')} value={newMinutes} keyboardType="number-pad" onChangeText={setNewMinutes} />
              <Input label={`${setupCopy('finish.services.add.price')} (£)`} value={newPrice} keyboardType="decimal-pad" placeholder="0.00" onChangeText={setNewPrice} />
              <View style={styles.badges}>
                <Button
                  label={busy === 'adding' ? setupCopy('finish.services.add.adding') : setupCopy('finish.services.add.cta')}
                  size="sm"
                  disabled={busy !== null}
                  loading={busy === 'adding'}
                  onPress={() => void addService()}
                />
                <Button label="Cancel" size="sm" variant="ghost" disabled={busy !== null} onPress={() => setAdding(false)} />
              </View>
            </View>
          ) : services.length > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => setAdding(true)}>
              <Text variant="label" tone="brand">
                {setupCopy('finish.services.add')}
              </Text>
            </Pressable>
          ) : null}
          {memberGroups.map((group) => (
            <MemberServicesChooser
              key={group.venue_id}
              group={group}
              selected={memberSelected}
              onChange={setMemberSelected}
              hostNames={
                new Map(services.filter((h) => selected.has(h.id)).map((h) => [h.name.trim().toLowerCase(), h.name] as const))
              }
              disabled={busy !== null}
            />
          ))}
          <Text variant="caption" tone="muted">
            {setupCopy(
              selectedServices.length + memberPicked.length === 1 ? 'finish.services.selectedOne' : 'finish.services.selected',
              { count: selectedServices.length + memberPicked.length },
            )}
          </Text>
        </View>
      ) : null}

      {step === 'calendars' ? (
        <View style={styles.section}>
          <Text variant="bodyMedium">{setupCopy('finish.calendars.heading')}</Text>
          <Text variant="caption" tone="secondary">
            {setupCopy('finish.calendars.help')}
          </Text>
          {groups.map((group) => {
            const active = group.calendars.filter((c) => c.is_active);
            const ready = pageServices.every((s) => venueReady(group, s.collective!.item_id!));
            const awaiting = pageServices.filter((s) => (group.awaiting_answer ?? []).includes(s.collective!.item_id!));
            return (
              <View key={group.venue_id} style={[styles.infoCard, { borderColor: colors.border, borderWidth: 1 }]}>
                <View style={styles.badges}>
                  <Text variant="bodyMedium">{group.venue_name}</Text>
                  {group.is_host ? <Badge label="Host" tone="brand" /> : null}
                </View>
                {awaiting.length > 0 ? (
                  <Text variant="caption" color={colors.warning}>
                    {setupCopy('finish.calendars.awaiting', { venue: group.venue_name })}
                  </Text>
                ) : null}
                {!ready ? (
                  <View style={styles.section}>
                    <Text variant="caption" color={colors.warning}>
                      {setupCopy('finish.calendars.notReady', { venue: group.venue_name })}
                    </Text>
                    <Pressable accessibilityRole="button" onPress={() => void refresh().then(() => seedCells())}>
                      <Text variant="label" tone="brand">
                        Check again
                      </Text>
                    </Pressable>
                  </View>
                ) : active.length === 0 ? (
                  <Text variant="caption" tone="muted">
                    {setupCopy('finish.calendars.noCalendars', { venue: group.venue_name })}
                  </Text>
                ) : (
                  pageServices
                    .filter((s) => !awaiting.includes(s))
                    .map((s) => {
                      const allOn = active.every((c) => cells[cellKey(s.id, group.venue_id, c.id)]);
                      return (
                        <View key={s.id} style={styles.section}>
                          <Text variant="label">{s.name}</Text>
                          <ChoiceRow
                            kind="checkbox"
                            selected={allOn}
                            title={setupCopy('finish.calendars.all')}
                            onPress={() =>
                              setCells((prev) => {
                                const next = { ...prev };
                                for (const c of active) next[cellKey(s.id, group.venue_id, c.id)] = !allOn;
                                return next;
                              })
                            }
                          />
                          {active.map((c) => {
                            const key = cellKey(s.id, group.venue_id, c.id);
                            return (
                              <ChoiceRow
                                key={c.id}
                                kind="checkbox"
                                selected={cells[key] === true}
                                title={c.name}
                                onPress={() => setCells((prev) => ({ ...prev, [key]: !(prev[key] === true) }))}
                              />
                            );
                          })}
                        </View>
                      );
                    })
                )}
              </View>
            );
          })}
        </View>
      ) : null}

      {step === 'done' ? (
        <View style={styles.section}>
          <Text variant="bodySmall" tone="secondary">
            {live ? setupCopy('finish.done.body', { collective: collectiveName }) : setupCopy('finish.done.notLive.body')}
          </Text>
          {slug ? (
            <View style={[styles.infoCard, { borderColor: colors.border, borderWidth: 1 }]}>
              <Text variant="caption" selectable>
                {fullAddress}
              </Text>
              <View style={styles.badges}>
                <Button
                  label={copied ? 'Copied' : setupCopy('finish.done.copy')}
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    void Clipboard.setStringAsync(fullAddress).then(() => setCopied(true));
                  }}
                />
                <Button
                  label={setupCopy('finish.done.open')}
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    void WebBrowser.openBrowserAsync(fullAddress).catch(() => toast.error('Could not open the browser.'));
                  }}
                />
              </View>
            </View>
          ) : null}
          {[
            { label: setupCopy('finish.done.design'), body: setupCopy('finish.done.design.body') },
            { label: setupCopy('finish.done.area'), body: setupCopy('finish.done.area.body') },
          ].map((next, i) => (
            <View key={next.label} style={[styles.numbered, { borderColor: colors.border }]}>
              <Text variant="label" tone="brand">
                {String(i + 1)}
              </Text>
              <View style={styles.flex1}>
                <Text variant="bodySmall">{next.label}</Text>
                <Text variant="caption" tone="secondary">
                  {next.body}
                </Text>
              </View>
            </View>
          ))}
          <Text variant="caption" tone="muted">
            {`${venueName} is the host of ${collectiveName}.`}
          </Text>
        </View>
      ) : null}
    </StepShell>
  );
}

/**
 * One member's own services in the services step (web `MemberServicesChooser`): tick any to put on
 * the page as they are. One already on the page shows ticked and cannot be changed here.
 */
function MemberServicesChooser({
  group,
  selected,
  onChange,
  hostNames,
  disabled,
}: {
  group: VenueServicesGroup;
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** The host's ticked services, by lower-cased name: a member's of the same name joins it. */
  hostNames: Map<string, string>;
  disabled: boolean;
}) {
  const pickable = group.services.filter((s) => !s.on_page);
  const keys = pickable.map((s) => venueServiceKey(group.venue_id, s.id));
  const allPicked = keys.length > 0 && keys.every((k) => selected.has(k));
  const toggle = (toggled: string[], on: boolean) => {
    const next = new Set(selected);
    for (const k of toggled) {
      if (on) next.add(k);
      else next.delete(k);
    }
    onChange(next);
  };
  return (
    <View style={styles.section}>
      <Text variant="overline" tone="secondary" accessibilityRole="header">
        {setupCopy('finish.services.theirs', { venue: group.venue_name })}
      </Text>
      {pickable.length > 1 ? (
        <ChoiceRow
          kind="checkbox"
          selected={allPicked}
          title={setupCopy('finish.services.selectAll')}
          disabled={disabled}
          onPress={() => toggle(keys, !allPicked)}
        />
      ) : null}
      {group.services.length === 0 ? (
        <Text variant="caption" tone="muted">
          {setupCopy('finish.services.theirsNone', { venue: group.venue_name })}
        </Text>
      ) : (
        group.services.map((s) => {
          const key = venueServiceKey(group.venue_id, s.id);
          const joinsHost = !s.on_page ? hostNames.get(s.name.trim().toLowerCase()) : undefined;
          const price = s.price_pence != null ? (formatPence(s.price_pence) ?? `£${(s.price_pence / 100).toFixed(2)}`) : null;
          // A ticked host service of the same name wins: theirs joins it. Otherwise the page service
          // it would join, if one is on the page already.
          const joins = joinsHost
            ? setupCopy('finish.services.joins', { service: joinsHost })
            : !s.on_page && s.joins
              ? areaCopy('vs.joins', { name: s.joins.name })
              : null;
          return (
            <ChoiceRow
              key={key}
              kind="checkbox"
              selected={s.on_page || selected.has(key)}
              disabled={s.on_page || disabled}
              title={s.name}
              summary={[s.duration_minutes ? `${s.duration_minutes} min` : null, price].filter(Boolean).join(' · ') || null}
              onPress={() => toggle([key], !selected.has(key))}>
              {s.on_page || !s.bookable_online ? (
                <View style={styles.badges}>
                  {s.on_page ? <Badge label={setupCopy('finish.services.onPage')} tone="brand" /> : null}
                  {!s.bookable_online ? <Badge label={setupCopy('finish.services.staffOnly')} /> : null}
                </View>
              ) : null}
              {joins ? (
                <Text variant="caption" tone="brand">
                  {joins}
                </Text>
              ) : null}
            </ChoiceRow>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  infoCard: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  numbered: {
    flexDirection: 'row',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
});
