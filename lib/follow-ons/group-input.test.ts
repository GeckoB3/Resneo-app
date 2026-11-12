import { DEFAULT_FOLLOW_ON_QUESTION, followOnGroupInputProblem, followOnQuestion } from './group-input';

const base = {
  name: 'Cut after colour',
  prompt_to_client: 'Would you like a cut after your colour?',
  offered_service_ids: ['cut', 'haircut'],
  trigger_service_ids: ['foils', 'roots'],
};

describe('followOnGroupInputProblem (web parity)', () => {
  it('accepts a group a client can be asked', () => {
    expect(followOnGroupInputProblem(base)).toBeNull();
  });

  it('accepts a group not yet asked after any service (added to services later)', () => {
    expect(followOnGroupInputProblem({ ...base, trigger_service_ids: [] })).toBeNull();
  });

  it.each([
    ['a blank name', { name: '  ' }, 'Give the group a name.'],
    ['a long name', { name: 'x'.repeat(121) }, 'Keep the name to 120 characters or fewer.'],
    ['a long question', { prompt_to_client: 'x'.repeat(301) }, 'Keep the question to 300 characters or fewer.'],
    ['nothing offered', { offered_service_ids: [] }, 'Choose at least one service to offer.'],
    ['an offer twice', { offered_service_ids: ['cut', 'cut'] }, 'Each service can be offered once.'],
    ['a trigger twice', { trigger_service_ids: ['foils', 'foils'] }, 'Each service can be listed once under "Ask after these services".'],
    [
      'a service on both sides (R10)',
      { trigger_service_ids: ['foils', 'cut'] },
      'A service cannot be both offered and asked after in the same group.',
    ],
  ])('refuses %s in words', (_label, over, words) => {
    expect(followOnGroupInputProblem({ ...base, ...over })).toBe(words);
  });
});

describe('followOnQuestion', () => {
  it('uses the group’s own question, else the default', () => {
    expect(followOnQuestion(' Add a cut? ')).toBe('Add a cut?');
    expect(followOnQuestion('   ')).toBe(DEFAULT_FOLLOW_ON_QUESTION);
    expect(followOnQuestion(null)).toBe(DEFAULT_FOLLOW_ON_QUESTION);
  });
});
