import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ErrorLine, Notice, PickRow, PosSheet, usePosT } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Input } from '@/components/ui/Input';
import { SearchBar } from '@/components/ui/SearchBar';
import { Text } from '@/components/ui/Text';
import { ApiError, apiErrorCode } from '@/lib/api/client';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { formatPhoneForDisplay } from '@/lib/phone/e164';
import { posErrorMessage } from '@/lib/pos/api';
import { reportsCopy } from '@/lib/pos/reports-copy';
import { parseMoneyInput } from '@/lib/pos/sale-math';
import { isPlausibleVoucherCode, normaliseVoucherCode } from '@/lib/pos/voucher-code';
import { todayInZone } from '@/lib/pos/voucher-math';
import { useGuests } from '@/lib/queries/useGuests';
import { useAddExistingVoucher } from '@/lib/queries/usePosReports';
import { addMonthsToYmd, formatMoneyExact } from '@/lib/reports/pos-report-format';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AddedVoucher } from '@/types/pos-reports';

/**
 * "Add an existing voucher" (web `AddExistingVoucherDialog`, UX spec §20.6): a voucher the venue
 * sold before ResNeo, with the code printed on it or a new ResNeo code, the amount left, its use-by
 * date (or none), the holder, an optional link to a client and a note. It isn't money taken. Needs
 * `manage_vouchers`; the server checks it again. A new code is shown once, then never again, and a
 * typed code is cleared as soon as it has been sent. Mounted only while open, so each opening
 * starts a fresh form.
 */
export function AddExistingVoucherSheet({
  visible,
  timeZone,
  currency,
  onClose,
}: {
  visible: boolean;
  timeZone: string;
  currency: string;
  onClose: () => void;
}) {
  const t = usePosT();
  const { colors } = useTheme();
  const { terminology } = useVenueContext();
  const money = (p: number) => formatMoneyExact(p, currency);
  const today = todayInZone(timeZone);
  const add = useAddExistingVoucher();
  const [codeChoice, setCodeChoice] = useState<'own' | 'new'>('own');
  const [code, setCode] = useState('');
  const [balanceText, setBalanceText] = useState('');
  const [never, setNever] = useState(false);
  const [day, setDay] = useState(addMonthsToYmd(today, 12));
  const [holder, setHolder] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [linked, setLinked] = useState<{ id: string; name: string } | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [done, setDone] = useState<AddedVoucher | null>(null);
  const [requestId, setRequestId] = useState(() => newPaymentAttemptId());
  const guests = useGuests({ search, limit: 20 }, { enabled: visible && !linked && search.trim().length >= 2 });

  const balance = parseMoneyInput(balanceText);
  const codeOk = codeChoice === 'new' || isPlausibleVoucherCode(code);
  const ready = codeOk && balance != null && balance > 0 && (never || day >= today);

  const save = async () => {
    if (codeChoice === 'own' && !isPlausibleVoucherCode(code)) {
      setCodeError(reportsCopy('vadd.code.invalid'));
      return;
    }
    if (balance == null || balance <= 0) return;
    setError(null);
    setCodeError(null);
    try {
      const res = await add.mutateAsync({
        client_request_id: requestId,
        ...(codeChoice === 'own' ? { code: normaliseVoucherCode(code) } : {}),
        balance_pence: balance,
        expires_on: never ? null : day,
        ...(holder.trim() ? { holder_name: holder.trim() } : {}),
        ...(email.trim() ? { holder_email: email.trim() } : {}),
        ...(linked ? { guest_id: linked.id } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      // The code field is cleared at once: a typed code is never kept longer than it is needed.
      setCode('');
      setDone(res);
    } catch (e) {
      if (e instanceof ApiError) setRequestId(newPaymentAttemptId());
      if (apiErrorCode(e) === 'POS_NAME_TAKEN') setCodeError(reportsCopy('vadd.code.taken'));
      else setError(posErrorMessage(e, t('common.networkError')));
    }
  };

  if (done) {
    const [before, after] = reportsCopy('vadd.newCode').split('{code}') as [string, string];
    return (
      <PosSheet
        visible={visible}
        onClose={onClose}
        title={reportsCopy('vadd.title')}
        footer={<Button label={reportsCopy('vadd.finish')} onPress={onClose} fullWidth />}>
        <Notice tone="success">
          {reportsCopy('vadd.done', { last4: done.voucher.code_last4 ?? '', amount: money(done.voucher.balance_pence) })}
        </Notice>
        {done.code ? (
          <View style={[styles.code, { borderColor: colors.warning, backgroundColor: colors.warningSurface }]}>
            <Text variant="body">
              {before}
              <Text variant="heading" style={styles.mono} selectable>
                {done.code}
              </Text>
              {after}
            </Text>
          </View>
        ) : null}
      </PosSheet>
    );
  }

  return (
    <PosSheet
      visible={visible}
      onClose={onClose}
      title={reportsCopy('vadd.title')}
      subtitle={reportsCopy('vadd.body')}
      footer={
        <View style={styles.footer}>
          <Button label={reportsCopy('vadd.confirm')} loading={add.isPending} disabled={!ready} onPress={() => void save()} fullWidth />
          <Button label={t('common.cancel')} variant="ghost" onPress={onClose} fullWidth />
        </View>
      }>
      <ErrorLine message={error} />
      <Text variant="label">{reportsCopy('vadd.codeChoice')}</Text>
      <PickRow title={reportsCopy('vadd.code.own')} selected={codeChoice === 'own'} onPress={() => setCodeChoice('own')} />
      <PickRow title={reportsCopy('vadd.code.new')} selected={codeChoice === 'new'} onPress={() => setCodeChoice('new')} />
      {codeChoice === 'own' ? (
        <Input
          accessibilityLabel={reportsCopy('vadd.codeChoice')}
          value={code}
          onChangeText={(v) => {
            setCode(v.toUpperCase());
            setCodeError(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          importantForAutofill="no"
          maxLength={64}
          error={codeError ?? undefined}
        />
      ) : null}
      <Input label={reportsCopy('vadd.balance')} accessibilityLabel={reportsCopy('vadd.balance')} value={balanceText} onChangeText={setBalanceText} keyboardType="decimal-pad" />
      <View style={styles.field}>
        <Text variant="label" tone="secondary">
          {reportsCopy('vadd.expiry')}
        </Text>
        <DatePickerField
          value={day}
          onChange={setDay}
          accessibilityLabel={reportsCopy('vadd.expiry')}
          minimumDate={new Date(`${today}T12:00:00`)}
          disabled={never}
        />
        <Chip label={reportsCopy('vadd.noExpiry')} selected={never} onPress={() => setNever((n) => !n)} />
      </View>
      <Input label={reportsCopy('vadd.holder')} accessibilityLabel={reportsCopy('vadd.holder')} value={holder} onChangeText={setHolder} maxLength={120} />
      <Input
        label={reportsCopy('vadd.email')}
        accessibilityLabel={reportsCopy('vadd.email')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        maxLength={254}
      />
      <View style={styles.field}>
        <Text variant="label" tone="secondary">
          {reportsCopy('vadd.client', { client: terminology.client.toLowerCase() })}
        </Text>
        {linked ? (
          <View style={[styles.linked, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text variant="body" numberOfLines={1} style={styles.flex}>
              {linked.name}
            </Text>
            <Button
              label="×"
              variant="ghost"
              size="sm"
              accessibilityLabel={reportsCopy('vadd.clientRemove', { name: linked.name })}
              onPress={() => setLinked(null)}
            />
          </View>
        ) : (
          <>
            <SearchBar value={search} onChangeText={setSearch} onClear={() => setSearch('')} placeholder={t('client.search')} />
            {(guests.data?.guests ?? []).map((g) => {
              const name = [g.first_name, g.last_name].filter(Boolean).join(' ').trim() || g.email || g.phone || '';
              return (
                <PickRow
                  key={g.id}
                  title={name}
                  detail={[formatPhoneForDisplay(g.phone), g.email].filter(Boolean).join(' · ') || null}
                  onPress={() => {
                    setLinked({ id: g.id, name });
                    setSearch('');
                  }}
                />
              );
            })}
          </>
        )}
      </View>
      <Input label={reportsCopy('vadd.note')} accessibilityLabel={reportsCopy('vadd.note')} value={note} onChangeText={setNote} maxLength={200} />
    </PosSheet>
  );
}

const styles = StyleSheet.create({
  footer: { gap: spacing.sm },
  field: { gap: spacing.xs },
  linked: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, paddingLeft: spacing.md },
  flex: { flex: 1 },
  code: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  mono: { fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }), letterSpacing: 2 },
});
