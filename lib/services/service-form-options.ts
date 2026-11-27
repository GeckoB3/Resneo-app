/**
 * Fixed choices and small helpers for the service form on the Services screen
 * (`app/(app)/manage/services.tsx`), moved out of the screen unchanged
 * (codebase standards P5.2).
 */
import type { ProcessingBlockDraft } from '@/components/services/ProcessingTimeBlocksEditor';
import type { ServiceLocationType, ServicePaymentRequirement } from '@/types/services-manage';

/** Web service colour presets (`APPOINTMENT_SERVICE_COLOUR_OPTIONS`). */
export const COLOUR_OPTIONS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

/**
 * The four payment options every venue can choose from (exact web copy). Card
 * hold (spec 6.2) is a standard option; it is no longer gated by a venue flag.
 */
export const PAYMENT_OPTIONS: { value: ServicePaymentRequirement; label: string; hint: string }[] = [
  { value: 'none', label: 'No online payment', hint: 'Pay at the business or arrange separately' },
  { value: 'deposit', label: 'Custom deposit', hint: 'Fixed amount paid online when booking' },
  { value: 'full_payment', label: 'Pay in full online', hint: 'Full price taken at booking' },
  {
    value: 'card_hold',
    label: 'Card hold',
    hint: 'No payment is taken when the client books. Their card is stored securely and you can charge a no-show fee if they do not attend.',
  },
];

/** Short label for a service's delivery location (collapsed-section summary). */
export const LOCATION_TYPE_LABELS: Record<ServiceLocationType, string> = {
  business_venue: 'At your business',
  client_address: "At the client's address",
  online: 'Online',
};

/** A card hold's no-show fee: a fixed amount, or a percentage of the price (web 2026-11-25). */
export type CardHoldFeeMode = 'fixed' | 'percent';
export const CARD_HOLD_FEE_MODE_OPTIONS: { value: CardHoldFeeMode; label: string }[] = [
  { value: 'fixed', label: 'Fixed amount' },
  { value: 'percent', label: 'Percentage of the price' },
];

/** The seven staff_may_customize_* flags shown in admin-only form section. */
export const STAFF_MAY_FIELDS: { key: keyof StaffMayState; label: string }[] = [
  { key: 'name', label: 'Display name' },
  { key: 'description', label: 'Description' },
  { key: 'duration', label: 'Duration' },
  { key: 'buffer', label: 'Buffer time' },
  { key: 'price', label: 'Price' },
  { key: 'deposit', label: 'Deposit' },
  { key: 'colour', label: 'Colour' },
];

export type StaffMayState = {
  name: boolean;
  description: boolean;
  duration: boolean;
  buffer: boolean;
  price: boolean;
  deposit: boolean;
  colour: boolean;
};

export const DEFAULT_STAFF_MAY: StaffMayState = {
  name: false,
  description: false,
  duration: false,
  buffer: false,
  price: false,
  deposit: false,
  colour: false,
};

/** Order-independent fingerprint of processing drafts, for change detection. */
export function processingFingerprint(drafts: ProcessingBlockDraft[]): string {
  return JSON.stringify(
    drafts
      .map((d) => [Number(d.start) || 0, Number(d.duration) || 0])
      .sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!),
  );
}
