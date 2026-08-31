/**
 * C6: the customer push channel ids are a contract with the server.
 *
 * The web sender sets `channelId` on the payload; this app creates the channel.
 * If the two disagree, Android drops the notification onto its fallback
 * "Miscellaneous" channel, which still DELIVERS. So the failure is silent: the
 * customer gets the message with the wrong importance, on a channel they cannot
 * meaningfully configure, and nothing anywhere reports a problem.
 *
 * Read out of the source rather than imported, because the ids live in a
 * module-private const inside a provider that pulls in expo-notifications. The
 * point is to catch a rename on either side, and a grep does that without
 * dragging the native stack into a test.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
/* eslint-enable @typescript-eslint/no-require-imports */

const source: string = fs.readFileSync(
  path.join(process.cwd(), 'providers/PushNotificationsProvider.tsx'),
  'utf8',
);

/** What `customer-push-notification.ts` on the web puts on the payload. */
const SERVER_CHANNEL_IDS = [
  'customer-reminders',
  'customer-booking-changes',
  'customer-waitlist',
] as const;

describe('every channel the server sends to exists in the app', () => {
  it.each(SERVER_CHANNEL_IDS)('creates %s', async (channelId) => {
    expect(source).toContain(`'${channelId}'`);
    // Named in a setNotificationChannelAsync call, not merely mentioned in a
    // comment: a channel that is only described does not exist on the device.
    const created = new RegExp(
      `setNotificationChannelAsync\\(\\s*CUSTOMER_ANDROID_CHANNELS\\.\\w+`,
      'g',
    );
    expect(source.match(created)?.length ?? 0).toBe(SERVER_CHANNEL_IDS.length);
  });
});

describe('the customer channels are not the staff ones', () => {
  it('keeps both sets, because one device can hold both roles', async () => {
    /*
      A dual-role person has a venue's alerts and their own bookings on one
      phone. Reusing the staff ids would mean muting "New bookings" overnight
      also silenced a reminder about their own appointment.
    */
    for (const staffId of ['bookings-new', 'bookings-changed', 'reminders']) {
      expect(source).toContain(`'${staffId}'`);
    }
  });

  it('does not reuse a staff id for a customer channel', async () => {
    // The ids must be distinct, or the two sets collapse into one in system
    // settings.
    const staff = new Set(['bookings-new', 'bookings-changed', 'reminders']);
    for (const customerId of SERVER_CHANNEL_IDS) {
      expect(staff.has(customerId)).toBe(false);
    }
  });
});

describe('channels are created for everyone, not only for customers', () => {
  it('has no role gate around the channel setup', async () => {
    /*
      Android channels are immutable once created and must exist before a
      notification can use one. Creating them lazily on a switch to customer
      mode would leave the first customer notification after an upgrade with
      nowhere to land. They cost nothing unused: a channel with no
      notifications is invisible in system settings.
    */
    const setup = source.slice(
      source.indexOf('async function configureAndroidChannels'),
      source.indexOf('catch (error)'),
    );
    expect(setup).not.toMatch(/useRole|role ===|audience/);
  });
});
