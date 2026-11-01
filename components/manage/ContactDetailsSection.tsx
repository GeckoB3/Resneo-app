import { useCallback, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import {
  CONTACT_DETAILS,
  isLoginEmail,
  type ContactDetail,
  type ContactDisplay,
  type ContactPlace,
} from '@/lib/booking/contactDisplay';
import { formatPhoneForDisplay } from '@/lib/phone/e164';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const DETAIL_LABELS: Record<ContactDetail, string> = {
  address: 'Address',
  phone: 'Phone',
  email: 'Email',
  website: 'Website',
};

const PLACE_LABELS: Record<ContactPlace, string> = {
  top: 'Top of page',
  about: 'About tab',
};

/** The details this section reads back; they are edited on the Venue profile screen. */
export interface ContactDetailsValues {
  name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

/**
 * Which contact details a booking page shows, and where (web `ContactDisplayGrid`). One grid for a
 * single venue and a collective page, so the choice reads the same after a venue joins one.
 */
export function ContactDisplayGrid({
  value,
  onChange,
  disabled = false,
  places = ['top', 'about'],
  details = [...CONTACT_DETAILS],
  placeLabels = PLACE_LABELS,
  aboutTabOff = false,
}: {
  value: ContactDisplay;
  onChange: (next: ContactDisplay) => void;
  disabled?: boolean;
  places?: ContactPlace[];
  details?: ContactDetail[];
  placeLabels?: Partial<Record<ContactPlace, string>>;
  /** The page's About tab is off, so the About column does nothing yet. */
  aboutTabOff?: boolean;
}) {
  const { colors } = useTheme();
  const label = (place: ContactPlace) => placeLabels[place] ?? PLACE_LABELS[place];
  return (
    <View style={styles.grid} testID="contact-display-grid">
      <View style={styles.row}>
        <View style={styles.detail} />
        {places.map((place) => (
          <View key={place} style={styles.cell}>
            <Text variant="caption" tone={place === 'about' && aboutTabOff ? 'muted' : 'secondary'} style={styles.heading}>
              {label(place)}
            </Text>
          </View>
        ))}
      </View>
      {details.map((detail) => (
        <View key={detail} style={styles.row}>
          <View style={styles.detail}>
            <Text variant="bodySmall">{DETAIL_LABELS[detail]}</Text>
          </View>
          {places.map((place) => (
            <View key={place} style={styles.cell}>
              <Switch
                testID={`contact-${place}-${detail}`}
                accessibilityLabel={`Show ${DETAIL_LABELS[detail].toLowerCase()}: ${label(place).toLowerCase()}`}
                value={value[place][detail]}
                disabled={disabled || (place === 'about' && aboutTabOff)}
                trackColor={{ true: colors.brand }}
                onValueChange={(on) => onChange({ ...value, [place]: { ...value[place], [detail]: on } })}
              />
            </View>
          ))}
        </View>
      ))}
      {aboutTabOff && places.includes('about') ? (
        <Text variant="caption" tone="muted">
          Your About tab is off. Turn it on under Public page tabs to choose what it shows.
        </Text>
      ) : null}
    </View>
  );
}

/** The details as they stand, and the way to change them. */
export function ContactDetailsSummary({
  values,
  onEdit,
}: {
  values: ContactDetailsValues;
  /** Absent on a screen that can only show them, such as a member reading the host's. */
  onEdit?: () => void;
}) {
  const row = (rowLabel: string, value: string | null) => (
    <View style={styles.summaryRow}>
      <Text variant="overline" tone="muted" style={styles.summaryLabel}>
        {rowLabel}
      </Text>
      <Text variant="bodySmall" tone={value ? undefined : 'muted'} style={styles.flex1}>
        {value || 'Not set'}
      </Text>
    </View>
  );
  return (
    <View style={styles.summary}>
      {row('Name', values.name)}
      {row('Address', values.address)}
      {row('Phone', values.phone ? (formatPhoneForDisplay(values.phone) ?? values.phone) : null)}
      {row('Email', values.email)}
      {row('Website', values.website)}
      {onEdit ? <Button label="Edit details" size="sm" variant="secondary" onPress={onEdit} /> : null}
    </View>
  );
}

/** What the prompt needs about the address the page would show (web `GuestEmailSource`). */
export interface GuestEmailSource {
  address: string | null;
  loginEmails: string[];
}

/**
 * Holds back a tick that would put a sign-in address on the public page until its owner has chosen
 * (web `useGuestEmailGate`). A new venue's email starts as its sign-in address, so this is the usual case.
 */
export function useGuestEmailGate(
  display: ContactDisplay,
  setDisplay: (next: ContactDisplay) => void,
  source: GuestEmailSource,
) {
  const [pending, setPending] = useState<ContactDisplay | null>(null);
  const onChange = useCallback(
    (next: ContactDisplay) => {
      const wasShown = display.top.email || display.about.email;
      const nowShown = next.top.email || next.about.email;
      if (!wasShown && nowShown && isLoginEmail(source.address, source.loginEmails)) {
        setPending(next);
        return;
      }
      setPending(null);
      setDisplay(next);
    },
    [display, setDisplay, source],
  );
  const accept = useCallback(() => {
    if (pending) setDisplay(pending);
    setPending(null);
  }, [pending, setDisplay]);
  const cancel = useCallback(() => setPending(null), []);
  return { onChange, pending: pending !== null, accept, cancel };
}

/** The address guests will see, the choice when it is a sign-in address, and the way to change it. */
export function GuestEmailNotice({
  source,
  shown,
  pending,
  onAccept,
  onCancel,
  onUseDifferent,
}: {
  source: GuestEmailSource;
  shown: boolean;
  pending: boolean;
  onAccept: () => void;
  onCancel: () => void;
  /** Opens where the separate email for guests is edited. */
  onUseDifferent?: () => void;
}) {
  const { colors } = useTheme();
  if (pending) {
    return (
      <View testID="guest-email-prompt" style={[styles.prompt, { backgroundColor: colors.warningSurface }]}>
        <Text variant="bodySmall">
          {`${source.address} is the address you sign in with. Anyone who visits your page could see it.`}
        </Text>
        <View style={styles.promptButtons}>
          {onUseDifferent ? (
            <Button label="Use a different email for guests" size="sm" onPress={onUseDifferent} />
          ) : null}
          <Button label="Show it anyway" size="sm" variant="secondary" onPress={onAccept} />
          <Button label="Not now" size="sm" variant="ghost" onPress={onCancel} />
        </View>
      </View>
    );
  }
  if (!shown) return null;
  return (
    <View testID="guest-email-line" style={styles.summary}>
      <Text variant="caption" tone="secondary">
        {`Guests see ${source.address ?? 'no email yet'}.${isLoginEmail(source.address, source.loginEmails) ? ' This is the address you sign in with.' : ''}`}
      </Text>
      {onUseDifferent ? (
        <Button label="Use a different email for guests" size="sm" variant="ghost" onPress={onUseDifferent} />
      ) : null}
    </View>
  );
}

/**
 * The Contact details section of a booking page's settings (web `BookingPageEditor`): the same
 * place on a single venue's page and a collective's.
 */
export function ContactDetailsSection({
  description,
  values,
  onEdit,
  display,
  onDisplayChange,
  aboutTabOff,
  emailNote,
  guestEmail,
}: {
  description: string;
  values: ContactDetailsValues;
  onEdit?: () => void;
  display: ContactDisplay;
  onDisplayChange: (next: ContactDisplay) => void;
  aboutTabOff: boolean;
  emailNote: string;
  guestEmail: GuestEmailSource;
}) {
  const gate = useGuestEmailGate(display, onDisplayChange, guestEmail);
  return (
    <Card style={styles.card} testID="contact-details-section">
      <Text variant="label">Contact details</Text>
      <Text variant="bodySmall" tone="secondary">
        {description}
      </Text>
      <ContactDetailsSummary values={values} onEdit={onEdit} />
      <Text variant="label">What guests see on this page</Text>
      <Text variant="caption" tone="muted">
        Confirmations, emails and receipts still include your address, so guests know where to go.
      </Text>
      <ContactDisplayGrid value={display} onChange={gate.onChange} aboutTabOff={aboutTabOff} />
      <GuestEmailNotice
        source={guestEmail}
        shown={display.top.email || display.about.email}
        pending={gate.pending}
        onAccept={gate.accept}
        onCancel={gate.cancel}
        onUseDifferent={onEdit}
      />
      <Text variant="caption" tone="muted">
        {emailNote}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  prompt: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: spacing.sm,
  },
  promptButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  grid: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  detail: {
    flex: 1,
    minWidth: 0,
  },
  cell: {
    width: 76,
    alignItems: 'center',
  },
  heading: {
    textAlign: 'center',
  },
  summary: {
    gap: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  summaryLabel: {
    width: 84,
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
});
