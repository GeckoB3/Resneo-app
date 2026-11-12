import {
  followOnQuestions,
  followOnStepComplete,
  insertFollowOnPicks,
  unmetRequiredFollowOns,
  type CatalogFollowOnGroup,
} from './rules';

const cutAfterColour: CatalogFollowOnGroup = {
  id: 'g-cut',
  prompt: 'Would you like a cut after your colour?',
  selection_type: 'single',
  required: true,
  trigger_service_ids: ['foils', 'roots'],
  offered_service_ids: ['cut-blow', 'haircut'],
};
const finishingTouch: CatalogFollowOnGroup = {
  id: 'g-finish',
  prompt: null,
  selection_type: 'multi',
  required: false,
  trigger_service_ids: ['haircut', 'toner'],
  offered_service_ids: ['blow-dry', 'olaplex'],
};
const groups = [cutAfterColour, finishingTouch];
const everything = () => true;

describe('followOnQuestions', () => {
  it('R1: asks only the groups whose trigger is in the visit', () => {
    expect(followOnQuestions({ groups, visitServiceIds: ['foils'], bookable: everything }).map((q) => q.group.id)).toEqual(['g-cut']);
    expect(followOnQuestions({ groups, visitServiceIds: ['beard'], bookable: everything })).toEqual([]);
  });

  it('R2: offers only what this client can book here, in the venue’s order', () => {
    const [q] = followOnQuestions({ groups, visitServiceIds: ['foils'], bookable: (id) => id !== 'cut-blow' });
    expect(q!.choices).toEqual(['haircut']);
  });

  it('R3 and R8: a group already answered by a ticked service shows its pick and nothing to choose', () => {
    const [q] = followOnQuestions({ groups, visitServiceIds: ['foils', 'haircut'], bookable: everything });
    expect(q!.chosen).toEqual(['haircut']);
    expect(q!.choices).toEqual(['cut-blow']);
    expect(unmetRequiredFollowOns({ groups, visitServiceIds: ['foils', 'haircut'], bookable: everything })).toEqual([]);
  });

  it('R4: a required group with nothing bookable lapses: not asked, not enforced', () => {
    expect(followOnQuestions({ groups, visitServiceIds: ['foils'], bookable: () => false })).toEqual([]);
    expect(unmetRequiredFollowOns({ groups, visitServiceIds: ['foils'], bookable: () => false })).toEqual([]);
  });

  it('R5: picks go after the later trigger when two are in the visit', () => {
    const [q] = followOnQuestions({ groups, visitServiceIds: ['foils', 'beard', 'roots'], bookable: everything });
    expect(q!.afterServiceId).toBe('roots');
  });

  it('R6: questions come in the visit’s order, and a picked service can raise its own', () => {
    const qs = followOnQuestions({ groups, visitServiceIds: ['toner', 'foils'], bookable: everything });
    expect(qs.map((q) => q.group.id)).toEqual(['g-finish', 'g-cut']);
    const after = followOnQuestions({ groups, visitServiceIds: ['foils', 'haircut'], bookable: everything });
    expect(after.map((q) => q.group.id)).toEqual(['g-cut', 'g-finish']);
  });

  it('R10: a group never offers one of its own triggers', () => {
    const odd: CatalogFollowOnGroup = { ...cutAfterColour, offered_service_ids: ['roots', 'haircut'] };
    const [q] = followOnQuestions({ groups: [odd], visitServiceIds: ['foils'], bookable: everything });
    expect(q!.choices).toEqual(['haircut']);
  });

  it('F3: the required group is unmet until a cut is in the visit; optional ones never are', () => {
    expect(unmetRequiredFollowOns({ groups, visitServiceIds: ['foils'], bookable: everything }).map((q) => q.group.id)).toEqual(['g-cut']);
    expect(unmetRequiredFollowOns({ groups, visitServiceIds: ['toner'], bookable: everything })).toEqual([]);
  });
});

describe('insertFollowOnPicks', () => {
  it('R5: puts each pick straight after its trigger, picks in the order picked', () => {
    expect(
      insertFollowOnPicks(['foils', 'beard'], [
        { serviceId: 'haircut', afterServiceId: 'foils' },
        { serviceId: 'olaplex', afterServiceId: 'foils' },
      ]),
    ).toEqual(['foils', 'haircut', 'olaplex', 'beard']);
  });

  it('adds a service once, and appends when the trigger is not found', () => {
    expect(insertFollowOnPicks(['foils', 'haircut'], [{ serviceId: 'haircut', afterServiceId: 'foils' }])).toEqual(['foils', 'haircut']);
    expect(insertFollowOnPicks(['foils'], [{ serviceId: 'x', afterServiceId: 'gone' }])).toEqual(['foils', 'x']);
  });
});

describe('followOnStepComplete', () => {
  const qs = followOnQuestions({ groups, visitServiceIds: ['foils', 'toner'], bookable: everything });
  it('needs a pick for each required question, none for optional ones', () => {
    expect(followOnStepComplete(qs, new Map())).toBe(false);
    expect(followOnStepComplete(qs, new Map([['g-cut', ['haircut']]]))).toBe(true);
  });
});
