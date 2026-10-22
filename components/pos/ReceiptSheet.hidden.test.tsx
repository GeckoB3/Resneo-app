/**
 * Sending a receipt for someone whose "Can see client phone numbers and emails" is off (web roles
 * plan A2, §5.6): the field starts empty rather than showing the client's email, and leaving it
 * empty sends to what is saved for them (the server's `to` is optional). The "sent" line never
 * repeats a hidden value. Everyone else gets the client's email filled in, as before.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));

import { ReceiptSheet } from '@/components/pos/AfterSaleSheets';
import { FULL_VIEWER_ACCESS, type ViewerAccess } from '@/lib/roles/roles';
import { makeSale } from '@/lib/pos/test-sale';
import { ViewerAccessProvider } from '@/providers/ViewerAccessProvider';

const HIDDEN: ViewerAccess = { canSeeClientContact: false, canExportClients: true, otherDiaries: 'book' };

async function renderAs(access: ViewerAccess, email: string | null) {
  const send = jest.fn().mockResolvedValue({ sent: true, destination: null });
  const onSent = jest.fn();
  const sale = makeSale({ guest: { id: 'g1', name: 'Ada Lovelace', email, phone: null } });
  await render(
    <ViewerAccessProvider value={access}>
      <ReceiptSheet visible onClose={jest.fn()} sale={sale} send={send} onSent={onSent} />
    </ViewerAccessProvider>,
  );
  return { send, onSent };
}

describe('ReceiptSheet with hidden contacts', () => {
  it('starts empty, says what an empty field does, and sends to the saved details', async () => {
    const { send, onSent } = await renderAs(HIDDEN, null);
    expect(screen.getByText('Leave this empty to send it to the email address saved for them.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getAllByText('Email receipt').at(-1)!);
    });
    expect(send).toHaveBeenCalledWith({ action: 'receipt', body: { channel: 'email' } });
    expect(onSent).toHaveBeenCalledWith('Receipt sent to their saved email address.');
  });

  it('sends to an address they type instead', async () => {
    const { send, onSent } = await renderAs(HIDDEN, null);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Email address or mobile number'), 'new@example.com');
    });
    await act(async () => {
      fireEvent.press(screen.getAllByText('Email receipt').at(-1)!);
    });
    expect(send).toHaveBeenCalledWith({ action: 'receipt', body: { channel: 'email', to: 'new@example.com' } });
    expect(onSent).toHaveBeenCalledWith('Receipt sent to new@example.com.');
  });

  it("fills in the client's email for everyone else", async () => {
    const { send } = await renderAs(FULL_VIEWER_ACCESS, 'ada@example.com');
    expect(screen.getByDisplayValue('ada@example.com')).toBeTruthy();
    expect(screen.queryByText('Leave this empty to send it to the email address saved for them.')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getAllByText('Email receipt').at(-1)!);
    });
    expect(send).toHaveBeenCalledWith({ action: 'receipt', body: { channel: 'email', to: 'ada@example.com' } });
  });
});
