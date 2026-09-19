import { defaultJoinDraft, joinChoicesFrom, joinStepsFor, joinSummaryCounts } from '@/lib/linked/join-choices';
import type { JoinPreview } from '@/types/collectives';

const preview: JoinPreview = {
  consent_version: 'join-2026-09',
  collective_name: 'Sept Collective',
  host_name: 'Sept 21 Hair',
  blocked: null,
  services_to_set_up: 3,
  same_name: [
    {
      item_id: 'item-1',
      host_service_id: 'h1',
      name: 'Beard Trim',
      my_service_id: 'm1',
      my_options: [
        { id: 'mo1', name: 'Short' },
        { id: 'mo2', name: 'Long' },
      ],
      host_options: [{ id: 'ho1', name: 'short' }],
    },
  ],
  own_services: [
    { id: 'own-1', name: 'Hot towel' },
    { id: 'own-2', name: 'Kids cut' },
  ],
  forms: [{ host_type_id: 'ft-1', name: 'Patch test', my_type_id: 'mt-1' }],
  warnings: { no_stripe_paid_services: 0, form_services: 0, forms_off: false },
  other_models: null,
};

describe('join choices (web JoinCollectiveDialog helpers)', () => {
  it('defaults to using the venue’s own same-named service, matching options by name, parking the rest, keeping its forms', () => {
    const draft = defaultJoinDraft(preview);
    expect(draft.sameName).toEqual({ 'item-1': 'use_mine' });
    expect(draft.optionMap).toEqual({ mo1: 'ho1', mo2: null });
    expect(draft.own).toEqual({ 'own-1': 'park', 'own-2': 'park' });
    expect(draft.forms).toEqual({ 'ft-1': 'use_existing' });
  });

  it('turns the draft into the route body', () => {
    const draft = defaultJoinDraft(preview);
    draft.own['own-2'] = 'ask';
    expect(joinChoicesFrom(preview, draft)).toEqual({
      same_name_choices: [
        {
          item_id: 'item-1',
          choice: 'use_mine',
          my_service_id: 'm1',
          option_map: [
            { my_variant_id: 'mo1', host_variant_id: 'ho1' },
            { my_variant_id: 'mo2', host_variant_id: null },
          ],
        },
      ],
      own_service_choices: [
        { service_id: 'own-1', choice: 'park' },
        { service_id: 'own-2', choice: 'ask' },
      ],
      form_choices: [{ host_type_id: 'ft-1', choice: 'use_existing', my_type_id: 'mt-1' }],
    });
    draft.sameName['item-1'] = 'add_new';
    draft.forms['ft-1'] = 'use_theirs';
    const body = joinChoicesFrom(preview, draft);
    expect(body.same_name_choices).toEqual([{ item_id: 'item-1', choice: 'add_new' }]);
    expect(body.form_choices).toEqual([{ host_type_id: 'ft-1', choice: 'use_theirs' }]);
  });

  it('adds the forms step only when the venue holds a matching form', () => {
    expect(joinStepsFor(preview)).toEqual(['means', 'services', 'forms', 'check']);
    expect(joinStepsFor({ ...preview, forms: [] })).toEqual(['means', 'services', 'check']);
  });

  it('counts what the check step summarises', () => {
    const draft = defaultJoinDraft(preview);
    draft.own['own-2'] = 'ask';
    expect(joinSummaryCounts(draft)).toEqual({ useMine: 1, park: 1, ask: 1 });
  });
});
