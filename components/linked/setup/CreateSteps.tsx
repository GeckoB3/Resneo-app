import { useCallback, useState, type Ref } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { ChoiceRow } from '@/components/linked/setup/ChoiceRow';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { getWebUrl } from '@/lib/env';
import { setupCopy } from '@/lib/linked/setup-copy';
import { useSlugAvailable } from '@/lib/queries/useCollectives';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * The two steps a new collective is made of, shared by Link with a venue (`LinkSetupSheet`) and
 * Create venue collective (`CreateCollectiveSheet`), so the two say the same thing: its name and
 * address, and what changes.
 */

export type CollectiveAddressState = 'idle' | 'checking' | 'free' | 'taken' | 'format';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

/**
 * The address a new collective takes: it follows the name until the host types one, and asks the
 * server whether it is free. `enabled` false asks nothing (the wizard, until a collective is wanted).
 */
export function useCollectiveAddress(name: string, enabled = true) {
  const [typed, setTyped] = useState('');
  const [touched, setTouched] = useState(false);
  const slug = touched ? typed : slugify(name);
  const query = useSlugAvailable(enabled ? slug : '');
  const state: CollectiveAddressState = !slug
    ? 'idle'
    : query.isFetching || !query.data
      ? 'checking'
      : query.data.available
        ? 'free'
        : query.data.format
          ? 'format'
          : 'taken';

  const change = useCallback((value: string) => {
    setTouched(true);
    setTyped(value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  }, []);
  const reset = useCallback(() => {
    setTouched(false);
    setTyped('');
  }, []);

  return { slug, state, change, reset };
}

/** Why the name step cannot go on yet, or null when it can. */
export function collectiveNameStepReason(name: string, addressState: CollectiveAddressState): string | null {
  if (name.trim().length < 2) return setupCopy('create.disabled.name');
  return addressState === 'free' ? null : setupCopy('create.disabled.address');
}

export function CollectiveNameStep({
  venueName,
  name,
  onChangeName,
  slug,
  addressState,
  onChangeAddress,
  disabledReason,
  showWhat = false,
  autoFocus = false,
  nameRef,
}: {
  venueName: string;
  name: string;
  onChangeName: (value: string) => void;
  slug: string;
  addressState: CollectiveAddressState;
  onChangeAddress: (value: string) => void;
  disabledReason: string | null;
  /** Create says what a collective is here; the wizard said it a step earlier. */
  showWhat?: boolean;
  autoFocus?: boolean;
  nameRef?: Ref<TextInput>;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      {showWhat ? (
        <View style={[styles.infoCard, { backgroundColor: colors.brandSubtle, borderColor: colors.border }]}>
          <Text variant="label">{setupCopy('create.what.title')}</Text>
          {(['1', '2', '3'] as const).map((n) => (
            <Text key={n} variant="caption" tone="secondary">
              {`• ${setupCopy(`create.what.${n}` as 'create.what.1')}`}
            </Text>
          ))}
          <Text variant="bodyMedium">{setupCopy('create.what.host', { venue: venueName })}</Text>
        </View>
      ) : (
        <Text variant="bodyMedium">{setupCopy('create.what.host', { venue: venueName })}</Text>
      )}
      <Input
        ref={nameRef}
        label={setupCopy('create.name.label')}
        helper={setupCopy('create.name.help', { venue: venueName })}
        value={name}
        maxLength={120}
        autoFocus={autoFocus}
        onChangeText={onChangeName}
      />
      <Input
        label="Page address"
        value={slug}
        maxLength={60}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onChangeAddress}
        leftIcon={
          <Text variant="bodySmall" tone="muted">
            /book/c/
          </Text>
        }
        helper={
          slug
            ? addressState === 'free'
              ? setupCopy('create.address.free')
              : addressState === 'checking'
                ? setupCopy('create.address.checking')
                : undefined
            : undefined
        }
        error={addressState === 'taken' ? setupCopy('create.address.taken') : addressState === 'format' ? setupCopy('create.address.format') : undefined}
      />
      {slug ? (
        <Text variant="caption" tone="muted">
          {setupCopy('create.address.preview', { origin: getWebUrl(), slug })}
        </Text>
      ) : null}
      {disabledReason ? (
        <Text variant="caption" tone="muted">
          {disabledReason}
        </Text>
      ) : null}
    </View>
  );
}

export function CollectiveChangesStep({
  collective,
  slug,
  venues,
  clientsBody,
  venueName,
  acknowledged,
  onToggleAcknowledged,
}: {
  /** The collective's name, as far as it has one. */
  collective: string;
  slug: string;
  /** Every venue whose address will lead to the page. */
  venues: { name: string; slug: string | null }[];
  /** The account links card: the wizard's link is the one being sent, Create's are in force already. */
  clientsBody: string;
  venueName: string;
  acknowledged: boolean;
  onToggleAcknowledged: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text variant="bodyMedium">{setupCopy('create.changes.title', { collective })}</Text>
      <Text variant="bodySmall" tone="secondary">
        {setupCopy('create.changes.intro')}
      </Text>
      <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {venues.map((row) => (
          <Text key={`${row.name}|${row.slug ?? ''}`} variant="caption" tone="secondary">
            {`${row.name}${row.slug ? ` (/book/${row.slug})` : ''} leads to /book/c/${slug}`}
          </Text>
        ))}
        <Text variant="caption" tone="secondary">
          {`${setupCopy('create.changes.address.note', { collective })} ${setupCopy('create.changes.address.when')}`}
        </Text>
      </View>
      {(['services', 'owns', 'clients'] as const).map((key) => (
        <View key={key} style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text variant="label">{setupCopy(`create.changes.${key}.title` as 'create.changes.services.title')}</Text>
          <Text variant="caption" tone="secondary">
            {key === 'clients' ? clientsBody : setupCopy(`create.changes.${key}.body` as 'create.changes.services.body', { collective })}
          </Text>
        </View>
      ))}
      <Text variant="caption" tone="secondary">
        {setupCopy('create.changes.ending', { collective })}
      </Text>
      <ChoiceRow
        kind="checkbox"
        selected={acknowledged}
        title={setupCopy('create.changes.ack', { venue: venueName })}
        onPress={onToggleAcknowledged}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  infoCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
});
