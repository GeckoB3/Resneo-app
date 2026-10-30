/**
 * Joining a collective, "Your other services" (web `JoinServicesStep`, 2026-10-27): each is a tick
 * box, ticked by default so it is suggested to the host, with "Suggest them all to {host}" above
 * them. An unticked one is parked.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { JoinMeansStep, JoinServicesStep, JoinSummaryList } from '@/components/linked/setup/JoinSteps';
import { defaultJoinDraft, joinChoicesFrom, type JoinDraft } from '@/lib/linked/join-choices';
import type { JoinPreview } from '@/types/collectives';

const preview: JoinPreview = {
  consent_version: 'join-2026-09',
  collective_name: 'Northside',
  host_name: 'Host Venue',
  blocked: null,
  services_to_set_up: 2,
  same_name: [],
  own_services: [
    { id: 'own-1', name: 'Hot towel' },
    { id: 'own-2', name: 'Kids cut' },
  ],
  forms: [],
  warnings: { no_stripe_paid_services: 0, form_services: 0, forms_off: false },
  other_models: null,
};

/** Every draft the step hands back, so a test can read what would be sent. */
const onDraft = jest.fn<void, [JoinDraft]>();
const lastDraft = () => onDraft.mock.calls.at(-1)?.[0] ?? null;

function Harness({ from = preview }: { from?: JoinPreview }) {
  const [draft, setDraft] = useState(() => defaultJoinDraft(from));
  return (
    <>
      <JoinServicesStep
        preview={from}
        draft={draft}
        onChange={(next) => {
          setDraft(next);
          onDraft(next);
        }}
        host="Host Venue"
        collective="Northside"
      />
      <JoinSummaryList preview={from} draft={draft} host="Host Venue" collective="Northside" />
    </>
  );
}

const checked = (label: string) => screen.getByLabelText(label).props.accessibilityState?.checked;

describe('JoinServicesStep, your other services', () => {
  beforeEach(() => {
    onDraft.mockClear();
  });

  it('ticks every one to be suggested by default, and says what that means', async () => {
    await render(<Harness />);
    expect(
      screen.getByText(
        'Ticked ones are suggested to Host Venue, who can add them to the Northside page as they are, in one go. Until Host Venue adds them, they are parked while you are part of Northside, and so is any you untick. Bookings already made for them are not changed.',
      ),
    ).toBeTruthy();
    expect(checked('Suggest them all to Host Venue')).toBe(true);
    expect(checked('Suggest Hot towel to Host Venue')).toBe(true);
    expect(checked('Suggest Kids cut to Host Venue')).toBe(true);
    expect(screen.getByText('• Host Venue will be asked to add 2 of your services.')).toBeTruthy();
  });

  it('parks an unticked one, and ticks or unticks them all at once', async () => {
    await render(<Harness />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Suggest Kids cut to Host Venue'));
    });
    expect(checked('Suggest Kids cut to Host Venue')).toBe(false);
    expect(checked('Suggest them all to Host Venue')).toBe(false);
    expect(joinChoicesFrom(preview, lastDraft()!).own_service_choices).toEqual([
      { service_id: 'own-1', choice: 'ask' },
      { service_id: 'own-2', choice: 'park' },
    ]);
    expect(screen.getByText('• 1 of your services will be parked until you leave Northside.')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Suggest them all to Host Venue'));
    });
    expect(checked('Suggest Kids cut to Host Venue')).toBe(true);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Suggest them all to Host Venue'));
    });
    expect(lastDraft()?.own).toEqual({ 'own-1': 'park', 'own-2': 'park' });
  });

  it('has no "all" box for a single service', async () => {
    await render(<Harness from={{ ...preview, own_services: [{ id: 'own-1', name: 'Hot towel' }] }} />);
    expect(screen.queryByLabelText('Suggest them all to Host Venue')).toBeNull();
    expect(checked('Suggest Hot towel to Host Venue')).toBe(true);
  });

  it('says when the venue has nothing of its own', async () => {
    await render(<Harness from={{ ...preview, own_services: [] }} />);
    expect(screen.getByText('You have no services of your own to decide about.')).toBeTruthy();
  });
});

/**
 * Step 1 of every join (CQ-08, R2-02): joining links the venue with every venue in the collective at
 * full access both ways, and the links stay after it leaves. Before this step 1 said only "Your clients
 * and bookings stay yours", and the links were named only when something blocked the join.
 */
describe('JoinMeansStep, what joining gives', () => {
  const withLinks: JoinPreview = {
    ...preview,
    links: [
      { venue_id: 'v-16', venue_name: 'Light 16', venue_slug: 'light-16', is_host: false, state: 'none', link_id: null },
      { venue_id: 'v-host', venue_name: 'Host Venue', venue_slug: 'host', is_host: true, state: 'full', link_id: 'l0' },
    ],
  };

  it('names every venue, host first, what their teams can do, and that the links last', async () => {
    await render(<JoinMeansStep preview={withLinks} host="Host Venue" collective="Northside" />);
    expect(screen.getByText('Your links with the venues in it')).toBeTruthy();
    const names = screen.getAllByText(/^(Host Venue|Light 16)$/).map((n) => n.props.children);
    expect(names).toEqual(['Host Venue', 'Light 16']);
    expect(screen.getByText('Already linked at full access')).toBeTruthy();
    expect(screen.getByText('Linked when you join')).toBeTruthy();
    expect(screen.getByText('• see your bookings, with client names, emails and phone numbers')).toBeTruthy();
    expect(screen.getByText('• make, move and cancel bookings in your calendars')).toBeTruthy();
    expect(screen.getByText('Your team can do the same at each of theirs.')).toBeTruthy();
    expect(screen.getByText(/^These links stay if you leave Northside, or if it ends/)).toBeTruthy();
    expect(screen.getByText(/Through your links, the other venues can see and manage them too\.$/)).toBeTruthy();
  });

  it('still says what joining gives when every link is already in place, and on an older server', async () => {
    await render(<JoinMeansStep preview={{ ...preview, links: undefined }} host="Host Venue" collective="Northside" />);
    expect(screen.getByText('Your links with the venues in it')).toBeTruthy();
    expect(screen.getByText(/^These links stay if you leave Northside/)).toBeTruthy();
  });
});
