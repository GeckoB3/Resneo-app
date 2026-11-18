/**
 * The card line's pieces (card-on-file-plan §6.2): the create fields, reading the client record's
 * answer, the controls on their own (group line, not possible), and the confirmation view.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@/lib/haptics', () => ({ hapticSelect: jest.fn(), hapticTap: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

import { staffCardConfirmationView } from '@/components/booking-wizard/StaffCardConfirmation';
import { StaffCardRequestControls } from '@/components/booking-wizard/StaffChargeControls';
import {
  DEFAULT_STAFF_CARD_REQUEST,
  parseStaffCardLookup,
  staffCardRequestFields,
} from '@/components/booking-wizard/staff-card-request';

describe('staffCardRequestFields', () => {
  it('sends the switch explicitly, and the tick only when on and allowed', () => {
    expect(staffCardRequestFields(DEFAULT_STAFF_CARD_REQUEST, { cardFound: false, tickAllowed: true })).toEqual({
      require_card_hold: true,
    });
    const ticked = { ...DEFAULT_STAFF_CARD_REQUEST, cancelIfNoCard: true };
    expect(staffCardRequestFields(ticked, { cardFound: false, tickAllowed: true })).toEqual({
      require_card_hold: true,
      cancel_if_no_card: true,
    });
    expect(staffCardRequestFields(ticked, { cardFound: false, tickAllowed: false })).toEqual({ require_card_hold: true });
    expect(
      staffCardRequestFields({ ...ticked, requestCard: false }, { cardFound: false, tickAllowed: true }),
    ).toEqual({ require_card_hold: false });
  });

  it('says "don\'t use the card" only for a found card, and nothing when cards are not possible', () => {
    const dont = { ...DEFAULT_STAFF_CARD_REQUEST, dontUseCard: true };
    expect(staffCardRequestFields(dont, { cardFound: true, tickAllowed: true })).toEqual({
      require_card_hold: true,
      use_card_on_file: false,
    });
    expect(staffCardRequestFields(dont, { cardFound: false, tickAllowed: true })).toEqual({ require_card_hold: true });
    // A card that is used has no tick to send.
    expect(
      staffCardRequestFields({ ...DEFAULT_STAFF_CARD_REQUEST, cancelIfNoCard: true }, { cardFound: true, tickAllowed: true }),
    ).toEqual({ require_card_hold: true });
    expect(
      staffCardRequestFields(DEFAULT_STAFF_CARD_REQUEST, { cardFound: true, tickAllowed: true, notPossible: true }),
    ).toEqual({ require_card_hold: false });
  });
});

describe('parseStaffCardLookup', () => {
  it('reads the card, whether cards can be taken and where a new card is kept', () => {
    expect(
      parseStaffCardLookup({
        card: { label: 'Visa ending 4242', brand: 'visa', last4: '4242', saved_with: 'TBP', scope: 'collective' },
        can_take_cards: true,
        add_saves_with: { scope: 'collective', name: 'TBP' },
      }),
    ).toEqual({
      card: { brand: 'visa', last4: '4242', label: 'Visa ending 4242', savedWith: 'TBP', scope: 'collective' },
      canTakeCards: true,
      addSavesWith: { scope: 'collective', name: 'TBP' },
    });
  });

  it('reads an empty or odd answer as no card and unknown', () => {
    expect(parseStaffCardLookup(null)).toEqual({ card: null, canTakeCards: null, addSavesWith: null });
    expect(parseStaffCardLookup({ card: null })).toEqual({ card: null, canTakeCards: null, addSavesWith: null });
  });
});

describe('StaffCardRequestControls', () => {
  it("a group: the lead's card covers everyone", async () => {
    const onChange = jest.fn();
    await render(
      <StaffCardRequestControls
        feePence={3000}
        value={DEFAULT_STAFF_CARD_REQUEST}
        onChange={onChange}
        foundCard={{ brand: 'visa', last4: '4242' }}
        group
        leadName="Amy Smith"
        tickAllowed
      />,
    );
    expect(
      screen.getByText("Protected by Amy Smith's card on file. It covers everyone in this booking. No-show fee up to £30.00."),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText("Don't use the card for this booking"));
    });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_STAFF_CARD_REQUEST, dontUseCard: true });
  });

  it('Card not possible names the business and offers nothing', async () => {
    await render(
      <StaffCardRequestControls
        feePence={1000}
        value={DEFAULT_STAFF_CARD_REQUEST}
        onChange={jest.fn()}
        notPossible
        businessName="Sage Studio"
        tickAllowed
        onAddCardNow={jest.fn()}
      />,
    );
    expect(screen.getByText("Card not possible: Sage Studio can't take card payments yet.")).toBeTruthy();
    expect(screen.queryByText('Add card now')).toBeNull();
    expect(screen.queryByLabelText('Send a card request')).toBeNull();
  });

  it('switching off clears the tick', async () => {
    const onChange = jest.fn();
    await render(
      <StaffCardRequestControls
        feePence={1000}
        value={{ ...DEFAULT_STAFF_CARD_REQUEST, cancelIfNoCard: true }}
        onChange={onChange}
        tickAllowed
      />,
    );
    await act(async () => {
      fireEvent(screen.getByLabelText('Send a card request'), 'valueChange', false);
    });
    expect(onChange).toHaveBeenCalledWith({ requestCard: false, cancelIfNoCard: false, dontUseCard: false });
  });
});

describe('staffCardConfirmationView', () => {
  it('folds the not-sent case in, and words Card not possible', () => {
    const waiting = { covered: false, state: 'waiting' as const, brand: null, last4: null, found_by: null, found_by_label: null, kind: null, cancel_if_no_card_at: null };
    const notSent = staffCardConfirmationView({ cardOnFile: waiting, paymentUrl: 'https://x', linkSent: false });
    expect(notSent.showLink).toBe(true);
    expect(notSent.lines[0]).toMatch(/^The client has no email or phone number/);
    expect(notSent.word).toBe('Waiting for card');
    const sent = staffCardConfirmationView({ cardOnFile: waiting, paymentUrl: 'https://x', linkSent: true });
    expect(sent.showLink).toBe(false);
    const np = staffCardConfirmationView({ cardOnFile: { ...waiting, state: 'not_possible' }, businessName: 'Sage' });
    expect(np).toEqual({
      heading: 'Booking confirmed',
      word: 'Card not possible',
      lines: ["Card not possible: Sage can't take card payments yet."],
      showLink: false,
    });
  });
});
