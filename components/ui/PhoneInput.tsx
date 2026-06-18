import { forwardRef, useState } from 'react';
import { type TextInput, type TextInputProps } from 'react-native';

import { Input } from '@/components/ui/Input';
import { normalizePhone } from '@/lib/phone/normalize';

type PhoneInputProps = {
  /** Current phone string (parent-controlled). */
  value: string;
  /** Fired on every keystroke (raw text) AND on blur with the normalised value. */
  onChangeText: (value: string) => void;
  label?: string;
  /** ISO-3166 alpha-2 default country for national numbers (default GB). */
  defaultCountry?: string;
  /** Error supplied by the parent (e.g. server-side); shown above the internal one. */
  error?: string;
  helper?: string;
  required?: boolean;
  optional?: boolean;
  placeholder?: string;
  /** Notified after blur whether the normalised value looks valid (≥7 digits or empty). */
  onValidityChange?: (valid: boolean) => void;
  /** Treat an empty value as valid (optional field). Default true. */
  allowEmpty?: boolean;
};

/** A normalised E.164-ish phone is at least a country code + a few subscriber digits. */
function looksValid(normalised: string, allowEmpty: boolean): boolean {
  if (!normalised) return allowEmpty;
  const digits = normalised.replace(/\D/g, '');
  return digits.length >= 7;
}

/**
 * PhoneInput — a shared phone field that normalises to an E.164-ish string on
 * blur via `normalizePhone`, with an inline validity error.
 *
 * Fabric/Reanimated focus rule (project memory): we do NOT call setState in
 * `onFocus`/`onBlur` in a way that re-renders the field while it is focused. The
 * focus ring is owned by the underlying `Input` (a Reanimated shared value).
 * Normalisation runs on blur — the field is *losing* focus at that point — and
 * the normalised value is pushed up via `onChangeText`, so the only re-render
 * happens after focus has already left the field. Live typing flows straight
 * through untouched.
 */
export const PhoneInput = forwardRef<TextInput, PhoneInputProps>(function PhoneInput(
  {
    value,
    onChangeText,
    label = 'Phone',
    defaultCountry = 'GB',
    error,
    helper,
    required,
    optional,
    placeholder = '+44 7700 900000',
    onValidityChange,
    allowEmpty = true,
  },
  ref,
) {
  // Internal error is only set on blur (field already losing focus), never on focus.
  const [blurError, setBlurError] = useState<string | null>(null);

  const handleBlur: NonNullable<TextInputProps['onBlur']> = () => {
    const normalised = normalizePhone(value, defaultCountry);
    // Push the normalised value up only when it actually changed, so we don't
    // churn the parent on every blur of an already-clean number.
    if (normalised !== value) {
      onChangeText(normalised);
    }
    const valid = looksValid(normalised, allowEmpty);
    setBlurError(valid ? null : 'Enter a valid phone number');
    onValidityChange?.(valid);
  };

  return (
    <Input
      ref={ref}
      label={label}
      value={value}
      onChangeText={(text) => {
        // Clear any stale validity error as the user edits again.
        if (blurError) setBlurError(null);
        onChangeText(text);
      }}
      onBlur={handleBlur}
      error={error ?? blurError ?? undefined}
      helper={helper}
      required={required}
      optional={optional}
      placeholder={placeholder}
      keyboardType="phone-pad"
      autoComplete="tel"
      textContentType="telephoneNumber"
      autoCapitalize="none"
    />
  );
});
