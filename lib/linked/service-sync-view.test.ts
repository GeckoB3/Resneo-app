import {
  askToSyncOnAdd,
  copiesOutOfStep,
  copySyncStatus,
  linkOfferingCopiesWords,
  linkedCopies,
  pageWideSyncWords,
  unlinkOfferingCopiesWords,
} from '@/lib/linked/service-sync-view';
import type { CatalogueItemView, CatalogueProviderView } from '@/types/collectives';

const provider = (over: Partial<CatalogueProviderView>): CatalogueProviderView => ({
  id: 'p',
  itemId: 'item',
  venueId: 'v',
  venueName: 'Venue',
  sourceServiceId: 'svc',
  sourceServiceName: 'Cut',
  practitionerId: 'cal',
  practitionerName: 'Kate',
  effectivePricePence: 4000,
  effectiveDurationMinutes: 45,
  status: 'active',
  sourceLive: true,
  ...over,
});

const origin = provider({ id: 'p-host', venueId: 'host', venueName: 'Host Salon', sourceServiceId: 'svc-host', sync: { state: 'none', originVenueName: null, inStep: null } });
const linkedInStep = provider({ id: 'p-a', venueId: 'a', venueName: 'Bay', sourceServiceId: 'svc-a', sync: { state: 'linked', originVenueName: 'Host Salon', inStep: true } });
const linkedBehind = provider({ id: 'p-b', venueId: 'b', venueName: 'Cove', sourceServiceId: 'svc-b', effectiveDurationMinutes: 30, sync: { state: 'linked', originVenueName: 'Host Salon', inStep: false } });
const independentDrifted = provider({ id: 'p-c', venueId: 'c', venueName: 'Dune', sourceServiceId: 'svc-c', effectiveDurationMinutes: 60, sync: { state: 'independent', originVenueName: null, inStep: false } });
const customised = provider({ id: 'p-d', venueId: 'd', venueName: 'Elm', sourceServiceId: 'svc-d', sync: { state: 'customised', originVenueName: 'Host Salon', inStep: false } });

const item: CatalogueItemView = {
  id: 'item',
  name: 'Cut',
  description: null,
  category: null,
  imageUrl: null,
  displayOrder: 0,
  defaultDurationMinutes: null,
  defaultPricePence: null,
  pricingDisplay: 'from',
  allowAnyAvailable: false,
  status: 'active',
  providers: [origin, linkedInStep, linkedBehind, independentDrifted, customised, { ...linkedInStep, id: 'p-a2', practitionerId: 'cal2' }],
  originVenueId: 'host',
  originVenueName: 'Host Salon',
};

describe('copiesOutOfStep / linkedCopies', () => {
  it('counts one service per venue, never the origin, and only what needs doing', () => {
    expect(copiesOutOfStep(item).map((p) => p.venueName)).toEqual(['Cove', 'Dune', 'Elm']);
    expect(linkedCopies(item).map((p) => p.venueName)).toEqual(['Bay', 'Cove', 'Elm']);
  });
  it('is empty without sync data', () => {
    const bare = { ...item, providers: item.providers.map((p) => ({ ...p, sync: undefined })) };
    expect(copiesOutOfStep(bare)).toEqual([]);
    expect(linkedCopies(bare)).toEqual([]);
  });
});

describe('copySyncStatus', () => {
  it('says nothing for the origin or without sync data', () => {
    expect(copySyncStatus(item, origin, 'Host Salon')).toBeNull();
    expect(copySyncStatus(item, { ...linkedInStep, sync: undefined }, 'Bay')).toBeNull();
  });
  it('linked and in step: an ok badge and Unlink', () => {
    const v = copySyncStatus(item, linkedInStep, 'Bay')!;
    expect(v.badge).toEqual({ tone: 'ok', text: 'Linked to Host Salon, in step' });
    expect(v.action.label).toBe('Unlink');
    expect(v.action.payload).toEqual({ action: 'detach_provider', providerId: 'p-a' });
  });
  it('linked and behind: names the length difference and offers Update', () => {
    const v = copySyncStatus(item, linkedBehind, 'Cove')!;
    expect(v.badge).toEqual({ tone: 'warn', text: 'Linked, behind Host Salon: 30 min here, 45 min at Host Salon' });
    expect(v.action.label).toBe('Update from Host Salon');
    expect(v.action.payload).toEqual({ action: 'sync_provider', providerId: 'p-b' });
  });
  it('independent and drifted: Not linked, differs, Link to', () => {
    const v = copySyncStatus(item, independentDrifted, 'Dune')!;
    expect(v.badge.text).toBe('Not linked. Differs from Host Salon: 1 hr here, 45 min at Host Salon');
    expect(v.action.payload).toEqual({ action: 'link_provider', providerId: 'p-c' });
  });
  it('customised: Edited at, Relink with force', () => {
    const v = copySyncStatus(item, customised, 'Elm')!;
    expect(v.badge.text).toBe('Edited at Elm, no longer following. Buffer, processing periods or options differ');
    expect(v.action.payload).toEqual({ action: 'sync_provider', providerId: 'p-d', forceSync: true });
  });
});

describe('the batch words', () => {
  it('per offering', () => {
    expect(linkOfferingCopiesWords(item)?.label).toBe('Link all 3 copies');
    expect(linkOfferingCopiesWords(item)?.payload).toEqual({ action: 'sync_all_providers', itemId: 'item' });
    expect(unlinkOfferingCopiesWords(item)?.label).toBe('Unlink all 3 copies');
    expect(linkOfferingCopiesWords({ ...item, providers: [origin, linkedInStep] })).toBeNull();
  });
  it('page-wide', () => {
    const words = pageWideSyncWords([item, { ...item, id: 'item2', providers: [origin, linkedBehind] }]);
    expect(words.link?.label).toBe('Link all copies (4)');
    expect(words.link?.payload).toEqual({ action: 'sync_all_providers' });
    expect(words.unlink?.label).toBe('Unlink all copies (4)');
    expect(pageWideSyncWords([])).toEqual({ link: null, unlink: null });
  });
});

describe('askToSyncOnAdd', () => {
  it('asks only when the venue already has the service and is not the origin', () => {
    expect(askToSyncOnAdd(item, 'c', 'Dune', true)?.confirmLabel).toBe('Link it');
    expect(askToSyncOnAdd(item, 'c', 'Dune', false)).toBeNull();
    expect(askToSyncOnAdd(item, 'host', 'Host Salon', true)).toBeNull();
    expect(askToSyncOnAdd({ ...item, originVenueId: null }, 'c', 'Dune', true)).toBeNull();
  });
});
