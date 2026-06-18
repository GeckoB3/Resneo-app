import { useState } from 'react';

import { ApiError } from '@/lib/api/client';
import { normalizePhone } from '@/lib/phone/normalize';
import { useChangeOwnPassword, usePatchStaffMe } from '@/lib/queries/useTeamMutations';
import type { StaffMe } from '@/types/staff';

/**
 * Shared personal-account form logic for the two surfaces that edit the
 * signed-in staff member's own profile + password:
 *   - `app/(app)/manage/account.tsx` (dedicated screen)
 *   - `components/manage/MyAccountSheet.tsx` (Team-tab sheet)
 *
 * Centralising the diff/validation/normalisation + the email-change session
 * refresh keeps the two surfaces from drifting (audit Settings-14 Low). Copy and
 * success/close behaviour stay caller-owned (the screen uses i18n, the sheet uses
 * hardcoded strings) via the message resolvers + callbacks below.
 *
 * Phone is normalised to an E.164-ish string with `normalizePhone` on save
 * (audit Settings-14 Medium) — so a national-format number is canonicalised
 * before it reaches the server. Validation/normalisation never block on an empty
 * phone (it's optional).
 *
 * Fabric focus rule (project memory): this hook never sets state from an
 * `onFocus`/`onBlur` handler. Field state updates flow from `onChangeText` and
 * the explicit save handlers only.
 */

export interface StaffAccountFormMessages {
  /** Returned after a successful profile save; `emailChanged` lets the caller vary copy. */
  profileSaved: (emailChanged: boolean) => string;
  /** Returned after a successful password change. */
  passwordChanged: string;
  /** Fallback when a profile save fails without an ApiError message. */
  profileError: string;
  /** Fallback when a password change fails without an ApiError message. */
  passwordError: string;
  /** Shown when the email field is empty. */
  emailRequired: string;
  /** Shown when the email field is not a valid address. */
  emailInvalid: string;
  /** Shown when the new password is shorter than `minPasswordLength`. */
  passwordTooShort: string;
  /** Shown when the new + confirm passwords differ. */
  passwordMismatch: string;
}

export interface UseStaffAccountFormOptions {
  staff: StaffMe | null;
  messages: StaffAccountFormMessages;
  /** Minimum new-password length (default 8 — matches the server). */
  minPasswordLength?: number;
  /** ISO-3166 alpha-2 default country for national phone numbers (default GB). */
  defaultCountry?: string;
  /** Async side-effect to refresh the auth session after the sign-in email changes. */
  onEmailChanged?: () => Promise<void> | void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function useStaffAccountForm({
  staff,
  messages,
  minPasswordLength = 8,
  defaultCountry = 'GB',
  onEmailChanged,
}: UseStaffAccountFormOptions) {
  // Profile fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  // Password fields
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const patchMe = usePatchStaffMe();
  const changePassword = useChangeOwnPassword();

  /** Seed the profile fields from a loaded staff row (idempotent). */
  function seed(row: StaffMe) {
    setName(row.name ?? '');
    setEmail(row.email);
    setPhone(row.phone ?? '');
    setEmailError(null);
  }

  /** Clear password inputs + error (call on close/after change). */
  function resetPasswordFields() {
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
  }

  /**
   * Diff-only PATCH body vs the seeded server values. Phone is normalised before
   * comparison so re-saving an already-canonical number is a no-op. Returns null
   * when nothing changed.
   */
  function buildProfilePatch(): { name?: string; email?: string; phone?: string } | null {
    if (!staff) return null;
    const patch: { name?: string; email?: string; phone?: string } = {};

    const trimmedName = name.trim();
    if (trimmedName !== (staff.name ?? '')) patch.name = trimmedName;

    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail !== staff.email.toLowerCase()) patch.email = trimmedEmail;

    const normalisedPhone = normalizePhone(phone, defaultCountry);
    if (normalisedPhone !== (staff.phone ?? '')) patch.phone = normalisedPhone;

    return Object.keys(patch).length > 0 ? patch : null;
  }

  const hasProfileChanges = buildProfilePatch() !== null;

  /**
   * Validate + save the profile. Returns a discriminated result so callers can
   * drive toasts / close behaviour without duplicating the success/error copy.
   */
  async function saveProfile(): Promise<
    | { status: 'noop' }
    | { status: 'invalid' }
    | { status: 'saved'; message: string; emailChanged: boolean }
    | { status: 'error'; message: string }
  > {
    if (!staff) return { status: 'noop' };

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setEmailError(messages.emailRequired);
      return { status: 'invalid' };
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setEmailError(messages.emailInvalid);
      return { status: 'invalid' };
    }
    setEmailError(null);

    const patch = buildProfilePatch();
    if (!patch) return { status: 'noop' };

    try {
      const result = await patchMe.mutateAsync(patch);
      // Re-seed from the authoritative server values.
      const row = result.staff;
      setName(row.name ?? '');
      setEmail(row.email);
      setPhone(row.phone ?? '');

      const emailChanged = !!patch.email;
      if (emailChanged && onEmailChanged) {
        try {
          await onEmailChanged();
        } catch {
          // best-effort — the staff↔user link keeps the session valid server-side.
        }
      }
      return {
        status: 'saved',
        emailChanged,
        message: messages.profileSaved(emailChanged),
      };
    } catch (err) {
      return {
        status: 'error',
        message: err instanceof ApiError ? err.message : messages.profileError,
      };
    }
  }

  /** Validate + change the password. Mirrors `saveProfile`'s result contract. */
  async function changeOwnPassword(): Promise<
    | { status: 'invalid' }
    | { status: 'changed'; message: string }
    | { status: 'error'; message: string }
  > {
    setPasswordError(null);
    if (newPassword.length < minPasswordLength) {
      setPasswordError(messages.passwordTooShort);
      return { status: 'invalid' };
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(messages.passwordMismatch);
      return { status: 'invalid' };
    }

    try {
      await changePassword.mutateAsync({ new_password: newPassword });
      resetPasswordFields();
      return { status: 'changed', message: messages.passwordChanged };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : messages.passwordError;
      setPasswordError(message);
      return { status: 'error', message };
    }
  }

  return {
    // Profile field bindings
    name,
    setName,
    email,
    setEmail,
    phone,
    setPhone,
    emailError,
    setEmailError,
    // Password field bindings
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    passwordError,
    setPasswordError,
    // Mutations (for loading/disabled states)
    patchMe,
    changePassword,
    // Derived + actions
    hasProfileChanges,
    seed,
    resetPasswordFields,
    saveProfile,
    changeOwnPassword,
  };
}
