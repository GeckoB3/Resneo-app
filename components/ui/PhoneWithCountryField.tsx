import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Input } from '@/components/ui/Input';
import { SearchBar } from '@/components/ui/SearchBar';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { countryName } from '@/lib/phone/country-names';
import {
  composeNationalAndCountry,
  countryFlag,
  getDialCodeForCountry,
  getSortedCountryCodes,
  nationalToE164,
  parseStoredPhoneForUi,
  POPULAR_COUNTRIES,
  type CountryCode,
} from '@/lib/phone/e164';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type PhoneWithCountryFieldProps = {
  /**
   * The parent's value: E.164 once the number is valid for the chosen country,
   * a composed "+cc digits" while it is being typed or is not valid (so a form
   * schema can refuse it), or '' when the field is empty.
   */
  value: string;
  onChange: (value: string) => void;
  /** The venue's default calling region (web: from its currency). */
  defaultCountry?: CountryCode;
  label?: string;
  error?: string;
  helper?: string;
  optional?: boolean;
  required?: boolean;
  editable?: boolean;
  testID?: string;
};

type Row = { kind: 'header'; title: string } | { kind: 'country'; code: CountryCode };

/**
 * Phone field with a country-code picker: a flag + dialling code trigger beside
 * a national-number input, the web's `PhoneWithCountryField` on the staff
 * booking form. The trigger opens a searchable sheet of every country
 * libphonenumber knows, GB / IE / US first. Validity comes from
 * libphonenumber, so "That number is not valid for the selected country" is
 * the same verdict the server gives.
 *
 * Fabric focus rule (project memory): nothing here sets state in onFocus; the
 * format error is set on blur, when the field is already losing focus.
 */
export function PhoneWithCountryField({
  value,
  onChange,
  defaultCountry = 'GB',
  label = 'Phone',
  error,
  helper,
  optional,
  required,
  editable = true,
  testID = 'phone-with-country',
}: PhoneWithCountryFieldProps) {
  const { colors } = useTheme();
  const initial = useMemo(() => parseStoredPhoneForUi(value, defaultCountry), [value, defaultCountry]);
  const [country, setCountry] = useState<CountryCode>(initial.countryCode);
  const [national, setNational] = useState(initial.nationalNumber);
  const [formatError, setFormatError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  /** What this field last handed up, so an external change (a picked contact) can be told from our own echo. */
  const lastEmittedRef = useRef(value);

  // The parent changed the value from outside (an existing contact was picked,
  // or the form was reset): re-split it into country + national.
  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    const parts = parseStoredPhoneForUi(value, defaultCountry);
    setCountry(parts.countryCode);
    setNational(parts.nationalNumber);
    setFormatError(null);
  }, [value, defaultCountry]);

  const emit = (nextCountry: CountryCode, nextNational: string) => {
    const next = nationalToE164(nextNational, nextCountry) ?? composeNationalAndCountry(nextNational, nextCountry);
    lastEmittedRef.current = next;
    onChange(next);
  };

  const handleNationalChange = (raw: string) => {
    if (formatError) setFormatError(null);
    setNational(raw);
    emit(country, raw);
  };

  const handleBlur = () => {
    if (!national.trim()) {
      setFormatError(null);
      return;
    }
    setFormatError(
      nationalToE164(national, country) ? null : 'That number is not valid for the selected country.',
    );
  };

  const selectCountry = (code: CountryCode) => {
    hapticSelect();
    setCountry(code);
    setPickerOpen(false);
    setSearch('');
    if (formatError) setFormatError(null);
    emit(code, national);
  };

  const countries = useMemo(() => getSortedCountryCodes(), []);
  const rows = useMemo<Row[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      const popular = POPULAR_COUNTRIES.filter((c) => countries.includes(c));
      const rest = countries.filter((c) => !POPULAR_COUNTRIES.includes(c));
      return [
        { kind: 'header', title: 'Popular' },
        ...popular.map((code) => ({ kind: 'country' as const, code })),
        { kind: 'header', title: 'All countries' },
        ...rest.map((code) => ({ kind: 'country' as const, code })),
      ];
    }
    return countries
      .filter((cc) => {
        const n = countryName(cc).toLowerCase();
        return n.includes(q) || cc.toLowerCase().includes(q) || getDialCodeForCountry(cc).includes(q);
      })
      .map((code) => ({ kind: 'country' as const, code }));
  }, [countries, search]);

  const combinedError = error ?? formatError ?? undefined;
  const dial = getDialCodeForCountry(country);

  return (
    <View style={styles.root} testID={testID}>
      {label ? (
        <Text variant="label" tone="secondary">
          {label}
          {required ? (
            <Text variant="label" color={colors.danger}>
              {' *'}
            </Text>
          ) : null}
          {optional ? (
            <Text variant="label" color={colors.textMuted}>
              {' (optional)'}
            </Text>
          ) : null}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Country: ${countryName(country)}, ${dial}`}
          accessibilityHint="Opens the country list"
          disabled={!editable}
          onPress={() => setPickerOpen(true)}
          testID={`${testID}-country`}
          style={({ pressed }) => [
            styles.trigger,
            {
              backgroundColor: colors.surface,
              borderColor: combinedError ? colors.danger : colors.border,
              opacity: !editable ? 0.6 : pressed ? 0.7 : 1,
            },
          ]}>
          <Text variant="body">{countryFlag(country)}</Text>
          <Text variant="bodyMedium" style={styles.dial}>
            {dial}
          </Text>
          <Text variant="caption" tone="muted">
            ▾
          </Text>
        </Pressable>
        <Input
          autoComplete="tel-national"
          containerStyle={styles.flex1}
          editable={editable}
          error={combinedError}
          helper={helper}
          keyboardType="phone-pad"
          onBlur={handleBlur}
          onChangeText={handleNationalChange}
          placeholder="7725 000 223"
          testID={`${testID}-national`}
          textContentType="telephoneNumber"
          value={national}
        />
      </View>

      <Sheet visible={pickerOpen} onClose={() => setPickerOpen(false)} fill maxHeight="85%">
        <View style={styles.sheetBody}>
          <Text variant="subheading">Country</Text>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search countries"
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
          />
          <FlatList
            data={rows}
            keyExtractor={(row) => (row.kind === 'header' ? `h-${row.title}` : row.code)}
            keyboardShouldPersistTaps="handled"
            style={styles.flex1}
            ListEmptyComponent={
              <Text variant="bodySmall" tone="muted" style={styles.empty}>
                No countries found
              </Text>
            }
            renderItem={({ item }) =>
              item.kind === 'header' ? (
                <Text variant="overline" tone="muted" style={styles.header}>
                  {item.title}
                </Text>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.code === country }}
                  accessibilityLabel={`${countryName(item.code)} ${getDialCodeForCountry(item.code)}`}
                  onPress={() => selectCountry(item.code)}
                  style={({ pressed }) => [
                    styles.countryRow,
                    item.code === country ? { backgroundColor: colors.surfaceRaised } : null,
                    pressed ? { opacity: 0.7 } : null,
                  ]}>
                  <Text variant="body">{countryFlag(item.code)}</Text>
                  <Text variant="bodyMedium" numberOfLines={1} style={styles.flex1}>
                    {countryName(item.code)}
                  </Text>
                  <Text variant="caption" tone="muted" style={styles.dial}>
                    {getDialCodeForCountry(item.code)}
                  </Text>
                  {item.code === country ? (
                    <Text variant="bodyMedium" color={colors.brand}>
                      ✓
                    </Text>
                  ) : null}
                </Pressable>
              )
            }
          />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    // The same box as the Input's field, so the two read as one control.
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  dial: {
    fontVariant: ['tabular-nums'],
  },
  flex1: {
    flex: 1,
    minWidth: 0,
  },
  sheetBody: {
    flex: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  header: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    minHeight: 44,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
