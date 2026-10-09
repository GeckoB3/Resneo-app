import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { PickRow, PosSheet } from '@/components/pos/parts';
import { CheckRow, FieldBlock, MessageBox, OptionList } from '@/components/pos/settings-more/parts';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Input } from '@/components/ui/Input';
import { SearchBar } from '@/components/ui/SearchBar';
import { Text } from '@/components/ui/Text';
import { addMonthsToDateStr } from '@/lib/dates/venue-dates';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { posFetch } from '@/lib/pos/api';
import { parseMoneyInput } from '@/lib/pos/sale-math';
import {
  fieldErrorFor,
  fieldErrorsFrom,
  isNetworkFailure,
  settingsErrorCode,
  settingsErrorMessage,
  settingsMorePaths,
} from '@/lib/pos/settings-more/api';
import type { FieldError } from '@/lib/pos/settings-more/types';
import { vchT } from '@/lib/pos/settings-more/vouchers-copy';
import { isPlausibleVoucherCode, normaliseVoucherCode } from '@/lib/pos/voucher-code';
import { todayInZone } from '@/lib/pos/voucher-math';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useGuests } from '@/lib/queries/useGuests';
import { usePosGate } from '@/lib/queries/usePos';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

import { guestRowLabel, guestRowSubtitle, moneyExact, type AddedVoucher } from './voucher-settings-logic';

/** `vadd.newCode`, split around the code so the code can be set in large type (as the web). */
const [NEW_CODE_BEFORE, NEW_CODE_AFTER] = vchT('vadd.newCode').split('{code}') as [string, string];

const SEARCH_DEBOUNCE_MS = 280;
/** Codes read best in a fixed-width face, as the web sets them. */
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/**
 * "Add an existing voucher" (UX spec §20.6, web `AddExistingVoucherDialog`): a voucher the venue
 * sold before ResNeo, with the code printed on it or a new ResNeo code, its balance, a use-by date
 * or none, the holder, a linked client and a note. It isn't money taken. `POST
 * /api/venue/pos/vouchers` kind `existing_voucher`, idempotent on `client_request_id`; needs
 * `manage_vouchers` (admins have it), which the server checks. A new ResNeo code is shown once.
 */
export function AddExistingVoucherSheet({
  visible,
  onClose,
  timeZone,
  expiryMonths,
  clientWord,
}: {
  visible: boolean;
  onClose: () => void;
  timeZone: string;
  /** The venue's saved expiry setting, to fill the use-by date. */
  expiryMonths: number | null;
  clientWord: string;
}) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { accessToken } = usePosGate();
  const today = todayInZone(timeZone);
  const [codeChoice, setCodeChoice] = useState<'own' | 'new'>('own');
  const [code, setCode] = useState('');
  const [balanceText, setBalanceText] = useState('');
  const [never, setNever] = useState(expiryMonths === null);
  const [day, setDay] = useState(() => addMonthsToDateStr(today, expiryMonths ?? 12));
  const [holder, setHolder] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [linked, setLinked] = useState<{ id: string; name: string } | null>(null);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldError[]>([]);
  const [done, setDone] = useState<AddedVoucher | null>(null);
  const requestId = useRef(newPaymentAttemptId());

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);
  const search = useGuests(
    { search: debounced, limit: 10, sort: 'name_asc', filter: 'all' },
    { enabled: visible && !linked && debounced.length >= 2 },
  );
  const results = debounced.length >= 2 ? (search.data?.guests ?? []) : [];

  const balance = parseMoneyInput(balanceText);
  const codeOk = codeChoice === 'new' || isPlausibleVoucherCode(code);
  const ready = codeOk && balance != null && balance > 0 && (never || day >= today);

  const save = async () => {
    if (codeChoice === 'own' && !isPlausibleVoucherCode(code)) {
      setCodeError(vchT('vpay.code.invalid'));
      return;
    }
    if (balance == null || balance <= 0 || !accessToken) return;
    setBusy(true);
    setError(null);
    setCodeError(null);
    setFields([]);
    try {
      const res = await posFetch<AddedVoucher>(settingsMorePaths.vouchers, {
        accessToken,
        method: 'POST',
        body: {
          kind: 'existing_voucher',
          client_request_id: requestId.current,
          ...(codeChoice === 'own' ? { code: normaliseVoucherCode(code) } : {}),
          balance_pence: balance,
          expires_on: never ? null : day,
          ...(holder.trim() ? { holder_name: holder.trim() } : {}),
          ...(email.trim() ? { holder_email: email.trim() } : {}),
          ...(linked ? { guest_id: linked.id } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      // The code field is cleared at once: a typed code is never kept longer than it is needed.
      setCode('');
      setDone(res);
      if (linked) {
        void queryClient.invalidateQueries({ queryKey: [...queryKeys.pos.all(), 'stored-value', keyScope(accessToken)] });
      }
    } catch (e) {
      if (!isNetworkFailure(e)) requestId.current = newPaymentAttemptId();
      if (settingsErrorCode(e) === 'POS_NAME_TAKEN') setCodeError(vchT('vadd.code.taken'));
      else {
        setError(settingsErrorMessage(e));
        setFields(fieldErrorsFrom(e));
      }
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <PosSheet
        visible={visible}
        onClose={onClose}
        title={vchT('vadd.title')}
        footer={<Button label={vchT('web.done')} onPress={onClose} fullWidth />}>
        <View style={styles.stack} accessibilityLiveRegion="polite">
          <MessageBox tone="success" role="status">
            {vchT('vadd.done', { last4: done.voucher.code_last4 ?? '', amount: moneyExact(done.voucher.balance_pence) })}
          </MessageBox>
          {done.code ? (
            <View style={[styles.codeBox, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
              <Text variant="body">{NEW_CODE_BEFORE.trim()}</Text>
              <Text variant="heading" selectable style={styles.code} accessibilityLabel={done.code.split('').join(' ')}>
                {done.code}
              </Text>
              <Text variant="body">{NEW_CODE_AFTER.replace(/^\./, '').trim()}</Text>
            </View>
          ) : null}
        </View>
      </PosSheet>
    );
  }

  const fieldError = (path: string) => fieldErrorFor(fields, path);

  return (
    <PosSheet
      visible={visible}
      onClose={onClose}
      title={vchT('vadd.title')}
      subtitle={vchT('vadd.body')}
      footer={
        <View style={styles.buttons}>
          <Button label={vchT('vadd.confirm')} onPress={() => void save()} loading={busy} disabled={!ready} fullWidth />
          <Button label={vchT('web.cancel')} variant="secondary" onPress={onClose} fullWidth />
        </View>
      }>
      <View style={styles.stack}>
        {error ? (
          <MessageBox tone="danger" role="alert">
            {error}
          </MessageBox>
        ) : null}
        <OptionList
          label={vchT('vadd.codeChoice')}
          value={codeChoice}
          onChange={setCodeChoice}
          options={[
            { value: 'own', label: vchT('vadd.code.own') },
            { value: 'new', label: vchT('vadd.code.new') },
          ]}
        />
        {codeChoice === 'own' ? (
          <Input
            accessibilityLabel={vchT('vadd.codeChoice')}
            value={code}
            onChangeText={(t) => {
              setCode(t.toUpperCase());
              setCodeError(null);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
            style={styles.mono}
            error={codeError ?? fieldError('code') ?? undefined}
          />
        ) : null}
        <FieldBlock label={vchT('vadd.balance')} error={fieldError('balance_pence')}>
          <Input
            accessibilityLabel={vchT('vadd.balance')}
            value={balanceText}
            onChangeText={setBalanceText}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
        </FieldBlock>
        <FieldBlock label={vchT('vadd.expiry')} error={fieldError('expires_on')}>
          <DatePickerField
            value={day}
            onChange={setDay}
            accessibilityLabel={vchT('vadd.expiry')}
            minimumDate={ymdToLocalDate(today)}
            disabled={never}
          />
          <CheckRow label={vchT('vadd.noExpiry')} checked={never} onChange={setNever} />
        </FieldBlock>
        <FieldBlock label={vchT('vadd.holder')} error={fieldError('holder_name')}>
          <Input accessibilityLabel={vchT('vadd.holder')} value={holder} onChangeText={setHolder} maxLength={120} />
        </FieldBlock>
        <FieldBlock label={vchT('vadd.email')} error={fieldError('holder_email')}>
          <Input
            accessibilityLabel={vchT('vadd.email')}
            value={email}
            onChangeText={setEmail}
            maxLength={254}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
          />
        </FieldBlock>
        <FieldBlock label={vchT('vadd.client', { client: clientWord })} error={fieldError('guest_id')}>
          {linked ? (
            <View style={[styles.linked, { borderColor: colors.border, backgroundColor: colors.surfaceSunken }]}>
              <Text variant="body" numberOfLines={1} style={styles.flex}>
                {linked.name}
              </Text>
              <Pressable
                onPress={() => setLinked(null)}
                accessibilityRole="button"
                accessibilityLabel={vchT('web.removeClient', { name: linked.name })}
                hitSlop={8}
                style={styles.remove}>
                <Text variant="bodyMedium" tone="secondary">
                  ×
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.searchStack}>
              <SearchBar
                value={q}
                onChangeText={setQ}
                onClear={() => setQ('')}
                placeholder={vchT('app.client.search')}
                accessibilityLabel={vchT('vadd.client', { client: clientWord })}
              />
              {results.map((g) => (
                <PickRow
                  key={g.id}
                  title={guestRowLabel(g)}
                  detail={guestRowSubtitle(g)}
                  onPress={() => {
                    setLinked({ id: g.id, name: guestRowLabel(g) });
                    setQ('');
                  }}
                />
              ))}
            </View>
          )}
        </FieldBlock>
        <FieldBlock label={vchT('vadd.note')} error={fieldError('note')}>
          <Input accessibilityLabel={vchT('vadd.note')} value={note} onChangeText={setNote} maxLength={200} />
        </FieldBlock>
      </View>
    </PosSheet>
  );
}

/** "YYYY-MM-DD" as a local noon Date, for the picker's earliest day. */
function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  buttons: { gap: spacing.sm },
  searchStack: { gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
  mono: { fontFamily: MONO, letterSpacing: 2 },
  code: { fontFamily: MONO, letterSpacing: 2 },
  codeBox: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  linked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  remove: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
