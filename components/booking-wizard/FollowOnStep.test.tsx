/**
 * The follow-on step's words (web follow-on plan 4.1, 4.4): a second question says it is optional
 * and why it was asked, a "Pick any" question says each pick is its own appointment, and a full
 * visit says so and stops new picks.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';

import { FollowOnStep, type FollowOnStepSection } from '@/components/booking-wizard/FollowOnStep';

const section = (id: string, over: Partial<FollowOnStepSection['question']['group']>, askedBecause: string | null) => ({
  question: {
    group: {
      id,
      prompt: null,
      selection_type: 'single' as const,
      required: false,
      trigger_service_ids: ['t'],
      offered_service_ids: ['a', 'b'],
      ...over,
    },
    afterServiceId: 't',
    choices: ['a', 'b'],
    chosen: [],
  },
  options: ['a', 'b'],
  askedBecause,
});

async function renderStep(visitCount: number, onToggle = jest.fn()) {
  await render(
    <FollowOnStep
      sections={[
        section('g1', { prompt: 'Would you like a cut after your colour?' }, null),
        section('g2', { selection_type: 'multi' }, 'Haircut'),
      ]}
      picks={{}}
      onToggle={onToggle}
      serviceCard={(id) => ({ name: id === 'a' ? 'Toner' : 'Gloss', durationMinutes: 15, priceLabel: '£10.00', description: null })}
      optionState={() => ({})}
      visitLabel="Full Head Foils"
      visitCount={visitCount}
      onContinue={jest.fn()}
      onSkip={jest.fn()}
    />,
  );
  return onToggle;
}

describe('FollowOnStep', () => {
  it('heads with the first question and explains the second', async () => {
    await renderStep(1);
    expect(screen.getByText('Would you like a cut after your colour?')).toBeTruthy();
    const second = screen.getByTestId('follow-on-question-g2');
    expect(within(second).getByText('Would you like to add one of these?')).toBeTruthy();
    expect(within(second).getByText('Optional')).toBeTruthy();
    expect(within(second).getByText('Asked because you added a Haircut.')).toBeTruthy();
    expect(within(second).getByText('Pick as many as you like. Each is booked as its own appointment.')).toBeTruthy();
    expect(screen.getAllByText('15 min')).toHaveLength(4);
  });

  it('says a full visit is full and stops new picks', async () => {
    const onToggle = await renderStep(4);
    expect(
      screen.getByText('Your visit already has 4 services, the most we can book together. Go back to remove one.'),
    ).toBeTruthy();
    await fireEvent.press(within(screen.getByTestId('follow-on-question-g1')).getByText('Toner'));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
