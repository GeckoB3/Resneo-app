/**
 * Class-commerce payload mappers + the commerce-enabled flag (pure). These pin
 * the same normalisation the web `creditPayload` / `coursePayload` /
 * `membershipPayload` helpers apply (pounds→pence, blank→null, empty arrays→null
 * for "all classes", currency 'gbp'), and the `class_commerce_enabled` gate the
 * UI reads from the merged `feature_flags.resolved`.
 */
import {
  courseStateToPayload,
  creditStateToPayload,
  deriveClassCommerceEnabled,
  membershipStateToPayload,
  poundsToPence,
} from '@/lib/queries/useClassProducts';
import type {
  CourseFormState,
  CreditFormState,
  MembershipFormState,
} from '@/types/class-products';

describe('poundsToPence', () => {
  it('converts pounds to integer pence', () => {
    expect(poundsToPence('90')).toBe(9000);
    expect(poundsToPence('45.50')).toBe(4550);
    expect(poundsToPence('£12.34')).toBe(1234);
  });

  it('returns 0 for blank, non-numeric or negative input (web parity)', () => {
    expect(poundsToPence('')).toBe(0);
    expect(poundsToPence('abc')).toBe(0);
    expect(poundsToPence('-5')).toBe(0);
  });
});

describe('deriveClassCommerceEnabled', () => {
  it('is true only when the merged flag is set', () => {
    expect(deriveClassCommerceEnabled({ class_commerce_enabled: true })).toBe(true);
  });

  it('is false when the flag is off, missing, or the payload is null/undefined', () => {
    expect(deriveClassCommerceEnabled({ class_commerce_enabled: false })).toBe(false);
    expect(deriveClassCommerceEnabled({})).toBe(false);
    expect(deriveClassCommerceEnabled(null)).toBe(false);
    expect(deriveClassCommerceEnabled(undefined)).toBe(false);
  });
});

describe('creditStateToPayload', () => {
  const base: CreditFormState = {
    name: '  10 Class Pass  ',
    description: '  Great for weekly classes  ',
    credits_count: '10',
    price: '90',
    validity_days: '90',
    eligible_class_type_ids: ['ct-1', 'ct-2'],
    active: true,
  };

  it('maps a fully-populated form to the API body', () => {
    expect(creditStateToPayload(base)).toEqual({
      name: '10 Class Pass',
      description: 'Great for weekly classes',
      credits_count: 10,
      price_pence: 9000,
      validity_days: 90,
      eligible_class_type_ids: ['ct-1', 'ct-2'],
      currency: 'gbp',
      active: true,
    });
  });

  it('nulls blank description, blank/zero validity and empty eligibility', () => {
    const out = creditStateToPayload({
      ...base,
      description: '   ',
      validity_days: '',
      eligible_class_type_ids: [],
    });
    expect(out.description).toBeNull();
    expect(out.validity_days).toBeNull();
    expect(out.eligible_class_type_ids).toBeNull();
  });

  it('treats a zero validity as no expiry (null)', () => {
    expect(creditStateToPayload({ ...base, validity_days: '0' }).validity_days).toBeNull();
  });
});

describe('courseStateToPayload', () => {
  const base: CourseFormState = {
    name: '6 Week Pilates',
    description: '',
    price: '120',
    max_enrollments: '12',
    session_instance_ids: ['ci-1', 'ci-2'],
    cancellation_window_days: '7',
    active: true,
  };

  it('maps a course form to the API body', () => {
    expect(courseStateToPayload(base)).toEqual({
      name: '6 Week Pilates',
      description: null,
      price_pence: 12000,
      max_enrollments: 12,
      session_instance_ids: ['ci-1', 'ci-2'],
      cancellation_window_days: 7,
      currency: 'gbp',
      active: true,
    });
  });

  it('keeps a 0-day cancellation window but nulls a blank one (non-refundable)', () => {
    expect(courseStateToPayload({ ...base, cancellation_window_days: '0' }).cancellation_window_days).toBe(0);
    expect(courseStateToPayload({ ...base, cancellation_window_days: '' }).cancellation_window_days).toBeNull();
  });

  it('nulls a blank/zero max enrollments', () => {
    expect(courseStateToPayload({ ...base, max_enrollments: '' }).max_enrollments).toBeNull();
    expect(courseStateToPayload({ ...base, max_enrollments: '0' }).max_enrollments).toBeNull();
  });
});

describe('membershipStateToPayload', () => {
  const base: MembershipFormState = {
    name: 'Unlimited Monthly',
    description: 'Best value',
    recurring_price: '49',
    recurring_interval: 'month',
    recurring_interval_count: '1',
    stripe_price_id: '',
    allowance_per_period: '8',
    rollover_limit: '4',
    discount_percent: '10',
    booking_window_days: '30',
    members_only_priority_hours: '24',
    eligible_class_type_ids: ['ct-1'],
    unlimited: false,
    rollover: true,
    allow_recurring: true,
    active: true,
  };

  it('builds nested rules and auto-billing fields from a recurring price', () => {
    const out = membershipStateToPayload(base);
    expect(out.name).toBe('Unlimited Monthly');
    expect(out.currency).toBe('gbp');
    expect(out.recurring_price_pence).toBe(4900);
    expect(out.recurring_interval).toBe('month');
    expect(out.recurring_interval_count).toBe(1);
    expect(out.rules).toMatchObject({
      unlimited: false,
      allowance_per_period: 8,
      rollover: true,
      rollover_limit: 4,
      discount_percent: 10,
      booking_window_days: 30,
      members_only_priority_hours: 24,
      eligible_class_type_ids: ['ct-1'],
      allow_recurring: true,
      // The recurring interval is mirrored onto rules too (web parity).
      recurring_interval: 'month',
      recurring_interval_count: 1,
    });
  });

  it('nulls the allowance when unlimited and never sends an empty eligibility array', () => {
    const out = membershipStateToPayload({
      ...base,
      unlimited: true,
      eligible_class_type_ids: [],
    });
    expect(out.rules?.unlimited).toBe(true);
    expect(out.rules?.allowance_per_period).toBeNull();
    expect(out.rules?.eligible_class_type_ids).toBeNull();
  });

  it('omits auto-billing fields when there is no recurring price, and sends a manual price id', () => {
    const out = membershipStateToPayload({
      ...base,
      recurring_price: '',
      stripe_price_id: '  price_123  ',
    });
    expect(out.recurring_price_pence).toBeUndefined();
    expect(out.recurring_interval).toBeUndefined();
    expect(out.stripe_price_id).toBe('price_123');
    // rules must not carry recurring_* when no auto price was set.
    expect(out.rules?.recurring_interval).toBeUndefined();
  });
});
