import { visibleAddonLibrary } from '@/lib/addons/visible-addon-library';
import type { VenueAddon, VenueAddonGroup } from '@/types/addon-groups';

const group = (id: string, is_active = true) => ({ id, name: id, is_active }) as unknown as VenueAddonGroup;
const option = (id: string, is_active = true) => ({ id, name: id, is_active }) as unknown as VenueAddon;

describe('visibleAddonLibrary (web QA FC-6)', () => {
  const groups = [group('live'), group('archived', false)];
  const addonsByGroup = { live: [option('mask'), option('old', false)], archived: [option('x')] };

  it('hides archived groups and inactive options from the list when the switch is off', () => {
    const view = visibleAddonLibrary(groups, addonsByGroup, false);
    expect(view.groups.map((g) => g.id)).toEqual(['live']);
    expect(view.addonsByGroup.live!.map((a) => a.id)).toEqual(['mask']);
  });

  it('shows everything with the switch on', () => {
    const view = visibleAddonLibrary(groups, addonsByGroup, true);
    expect(view.groups).toHaveLength(2);
    expect(view.addonsByGroup.live).toHaveLength(2);
  });

  it('never changes the full set the editor is given', () => {
    visibleAddonLibrary(groups, addonsByGroup, false);
    expect(addonsByGroup.live).toHaveLength(2);
  });
});
