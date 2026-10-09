/**
 * Checkout messages (web `src/lib/communications/pos-message-switches.ts`, plan §4.23): the same
 * switches and copy as the web, the same visibility rules, missing read as on, and a save body
 * that carries `pos` only when a switch changed, so a lanes-only save never touches the block.
 */
import {
  POS_MESSAGES_COPY,
  POS_MESSAGE_SWITCHES,
  SHOP_MESSAGE_SWITCHES,
  buildCommunicationPoliciesPatch,
  defaultPosMessageSwitches,
  parsePosMessageSwitches,
  posMessageFeatures,
  samePosMessageSwitches,
  visiblePosMessageSwitches,
} from './pos-message-switches';

const flags = (resolved: Record<string, boolean>) =>
  ({ feature_flags: { resolved } }) as unknown as Parameters<typeof posMessageFeatures>[0];

describe('POS message switches', () => {
  it('has the web switches, in the web order, with the web copy', () => {
    expect(POS_MESSAGE_SWITCHES.map((s) => [s.key, s.feature, s.label])).toEqual([
      ['pos_sale_receipt', 'pos', 'Sale receipt'],
      ['pos_refund_receipt', 'pos', 'Refund receipt'],
      ['voucher_expiry_reminder', 'vouchers', 'Gift voucher expiry reminder'],
    ]);
    expect(POS_MESSAGE_SWITCHES[0].description).toBe(
      'Emailed automatically after a sale, when Checkout is set to send receipts. Staff can still send one when a client asks.',
    );
    expect(SHOP_MESSAGE_SWITCHES.map((s) => [s.key, s.label])).toEqual([
      ['shop_delivered_email_enabled', 'Order delivered'],
      ['shop_ready_sms_enabled', 'Ready to collect text'],
    ]);
  });

  it('uses no em-dash in any copy', () => {
    const all = [
      ...Object.values(POS_MESSAGES_COPY),
      ...POS_MESSAGE_SWITCHES.flatMap((s) => [s.label, s.description]),
      ...SHOP_MESSAGE_SWITCHES.flatMap((s) => [s.label, s.description]),
    ];
    for (const text of all) expect(text).not.toContain(String.fromCharCode(0x2014));
  });

  it('reads the features from the resolved flags: vouchers and shop only with Checkout on', () => {
    expect(posMessageFeatures(null)).toEqual({ pos: false, vouchers: false, shop: false });
    expect(posMessageFeatures(flags({ pos_gift_vouchers_enabled: true, pos_online_shop_enabled: true }))).toEqual({
      pos: false,
      vouchers: false,
      shop: false,
    });
    expect(posMessageFeatures(flags({ pos_enabled: true, pos_online_shop_enabled: true }))).toEqual({
      pos: true,
      vouchers: false,
      shop: true,
    });
  });

  it('shows nothing without Checkout and the voucher reminder only with vouchers', () => {
    expect(visiblePosMessageSwitches({ pos: false, vouchers: true, shop: true })).toEqual([]);
    expect(visiblePosMessageSwitches({ pos: true, vouchers: false, shop: false }).map((s) => s.key)).toEqual([
      'pos_sale_receipt',
      'pos_refund_receipt',
    ]);
    expect(visiblePosMessageSwitches({ pos: true, vouchers: true, shop: false }).map((s) => s.key)).toContain(
      'voucher_expiry_reminder',
    );
  });

  it('reads a missing or malformed block as all on, and only an explicit false as off', () => {
    expect(parsePosMessageSwitches(undefined)).toEqual(defaultPosMessageSwitches());
    expect(parsePosMessageSwitches('nope')).toEqual(defaultPosMessageSwitches());
    const parsed = parsePosMessageSwitches({
      pos_sale_receipt: { enabled: false },
      pos_refund_receipt: { enabled: 'no' },
      unknown_key: { enabled: false },
    });
    expect(parsed).toEqual({ ...defaultPosMessageSwitches(), pos_sale_receipt: { enabled: false } });
    expect(samePosMessageSwitches(parsed, defaultPosMessageSwitches())).toBe(false);
    expect(samePosMessageSwitches(parsed, parsePosMessageSwitches({ pos_sale_receipt: { enabled: false } }))).toBe(true);
  });

  it('sends pos only when a switch changed, so a lanes-only save leaves the block alone', () => {
    const lane = { booking_confirmation: { enabled: false, channels: ['email' as const] } };
    const pos = { ...defaultPosMessageSwitches(), pos_refund_receipt: { enabled: false } };
    expect(buildCommunicationPoliciesPatch({ lane, laneChanged: true, pos, posChanged: false })).toEqual({
      appointments_other: lane,
    });
    expect(buildCommunicationPoliciesPatch({ lane, laneChanged: false, pos, posChanged: true })).toEqual({ pos });
    expect(buildCommunicationPoliciesPatch({ lane, laneChanged: true, pos, posChanged: true })).toEqual({
      appointments_other: lane,
      pos,
    });
    expect(buildCommunicationPoliciesPatch({ lane, laneChanged: false, pos, posChanged: false })).toBeNull();
  });
});
