/**
 * F-2 (web 2026-09-23): the combined page editor's "Meet the team" lists the
 * live page's team from the catalogue GET, so it offers the same people guests
 * see. On a shared-services collective the member calendars can be empty while
 * the live page shows a team, and the editor said there was nobody to set up.
 * With no live team (older server, or a failed load) it falls back to building
 * the list from the member calendars, as before.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { render, screen } from '@testing-library/react-native';

import type { CatalogueResponse } from '@/types/collectives';

let mockCatalogue: { data: CatalogueResponse | undefined; isLoading: boolean } = {
  data: undefined,
  isLoading: false,
};
jest.mock('@/lib/queries/useCollectives', () => ({
  useCollectiveCatalogue: () => mockCatalogue,
  useUpdateCollective: () => ({ mutateAsync: jest.fn(() => Promise.resolve({})), isPending: false }),
  useUploadPageAsset: () => ({ mutateAsync: jest.fn(), isPending: false }),
  pickVenueImage: jest.fn(() => Promise.resolve(null)),
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

import { CombinedPageTeamProfiles, resolveEditorTeam } from '@/components/linked/CombinedPageTeamProfiles';

const memberSources = [
  {
    venueId: 'venue-1',
    venueName: 'Glow',
    services: [],
    practitioners: [{ id: 'cal-1', name: 'Front desk', services: [] }],
  },
];

function catalogueWith(team: CatalogueResponse['team']): CatalogueResponse {
  return {
    catalogue: { collectiveId: 'col-1', pageMode: 'unified_catalog', items: [], memberSources },
    importSources: [],
    team,
  };
}

async function renderEditor() {
  await render(<CombinedPageTeamProfiles collectiveId="col-1" config={{}} onChanged={jest.fn()} />);
}

describe('resolveEditorTeam (F-2)', () => {
  it("uses the live page's team when it has anyone", () => {
    expect(
      resolveEditorTeam([{ id: 'p-1', name: 'Andrew' }], [
        { venueName: 'Glow', practitioners: [{ id: 'cal-1', name: 'Front desk' }] },
      ]),
    ).toEqual([{ id: 'p-1', name: 'Andrew' }]);
  });

  it('falls back to the member calendars when the live team is empty, null or missing', () => {
    const sources = [{ venueName: 'Glow', practitioners: [{ id: 'cal-1', name: 'Front desk' }] }];
    const fallback = [{ id: 'cal-1', name: 'Front desk' }];
    expect(resolveEditorTeam([], sources)).toEqual(fallback);
    expect(resolveEditorTeam(null, sources)).toEqual(fallback);
    expect(resolveEditorTeam(undefined, sources)).toEqual(fallback);
    expect(resolveEditorTeam(undefined, undefined)).toEqual([]);
  });
});

describe('CombinedPageTeamProfiles (F-2)', () => {
  it("lists the live page's team rather than every member calendar", async () => {
    mockCatalogue = { data: catalogueWith([{ id: 'p-1', name: 'Andrew' }]), isLoading: false };
    await renderEditor();
    expect(screen.getByText('Andrew')).toBeTruthy();
    expect(screen.queryByText('Front desk')).toBeNull();
    expect(screen.queryByText('Add bookable team members to configure their profiles.')).toBeNull();
  });

  it('builds the list from the member calendars when the server sent no team', async () => {
    mockCatalogue = { data: catalogueWith(null), isLoading: false };
    await renderEditor();
    expect(screen.getByText('Front desk')).toBeTruthy();
  });
});
