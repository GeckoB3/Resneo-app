import { Pressable, StyleSheet, View } from 'react-native';

import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ServiceLocationType } from '@/types/services-manage';

const LOCATION_OPTIONS: {
  value: ServiceLocationType;
  label: string;
  hint: string;
}[] = [
  {
    value: 'business_venue',
    label: 'At your venue',
    hint: 'Clients come to your business address.',
  },
  {
    value: 'client_address',
    label: "At the client's address",
    hint: 'You travel to them — the booking form collects their address.',
  },
  {
    value: 'online',
    label: 'Online',
    hint: 'Delivered remotely (video call, etc.).',
  },
];

/**
 * Normalise a user-entered meeting link the same way the web does: trim, and
 * prefix `https://` when no scheme is present so "zoom.us/j/123" becomes a valid
 * absolute URL. Empty input returns '' (clears the field).
 */
export function normalizeMeetingUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Avoid prefixing things that already look like another scheme (mailto:, etc.).
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** True when the (normalised) URL is a valid http(s) link, mirroring the API refine. */
export function isValidMeetingUrl(raw: string): boolean {
  const value = normalizeMeetingUrl(raw);
  if (!value) return true; // empty is allowed (clears the link)
  try {
    const u = new URL(value);
    return (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.hostname);
  } catch {
    return false;
  }
}

interface ServiceLocationSectionProps {
  locationType: ServiceLocationType;
  onLocationTypeChange: (next: ServiceLocationType) => void;
  meetingUrl: string;
  onMeetingUrlChange: (next: string) => void;
  meetingInfo: string;
  onMeetingInfoChange: (next: string) => void;
  /** Show the inline invalid-URL hint (set by the parent after a failed save attempt). */
  urlError?: string | null;
}

/**
 * Location / online-meeting section for the service sheet. Radio list for the
 * delivery type, with conditional online-meeting link + joining-info inputs
 * (link normalised + validated like the web dashboard).
 */
export function ServiceLocationSection({
  locationType,
  onLocationTypeChange,
  meetingUrl,
  onMeetingUrlChange,
  meetingInfo,
  onMeetingInfoChange,
  urlError,
}: ServiceLocationSectionProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <Text variant="overline" tone="muted">
        Location
      </Text>
      <Text variant="caption" tone="muted">
        Where this service is delivered. Confirmation and reminder emails show this instead of your
        venue address for client-address and online services.
      </Text>

      {LOCATION_OPTIONS.map((option) => {
        const selected = locationType === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onLocationTypeChange(option.value)}
            style={({ pressed }) => [
              styles.radioRow,
              {
                borderColor: selected ? colors.brand : colors.border,
                backgroundColor: selected ? colors.brandSubtle : colors.surface,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <View
              style={[
                styles.radioDot,
                { borderColor: selected ? colors.brand : colors.borderStrong },
              ]}>
              {selected ? (
                <View style={[styles.radioDotInner, { backgroundColor: colors.brand }]} />
              ) : null}
            </View>
            <View style={styles.radioText}>
              <Text variant="bodyMedium">{option.label}</Text>
              <Text variant="caption" tone="muted">
                {option.hint}
              </Text>
            </View>
          </Pressable>
        );
      })}

      {locationType === 'client_address' ? (
        <Text variant="caption" tone="muted">
          The booking form asks the client for their address; it is saved to their contact record
          and shown as the location in emails.
        </Text>
      ) : null}

      {locationType === 'online' ? (
        <View style={styles.onlineFields}>
          <Input
            label="Link to the online service (optional)"
            helper="Included in confirmation and reminder emails so the client can join."
            value={meetingUrl}
            onChangeText={onMeetingUrlChange}
            onBlur={() => {
              const normalized = normalizeMeetingUrl(meetingUrl);
              if (normalized !== meetingUrl) onMeetingUrlChange(normalized);
            }}
            error={urlError ?? undefined}
            placeholder="https://zoom.us/j/123456789"
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={500}
          />
          <Input
            label="Joining information (optional)"
            helper="Shown with the link in confirmation and reminder emails."
            value={meetingInfo}
            onChangeText={onMeetingInfoChange}
            multiline
            style={styles.multiline}
            maxLength={2000}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  radioDot: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDotInner: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  radioText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  onlineFields: {
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
});
