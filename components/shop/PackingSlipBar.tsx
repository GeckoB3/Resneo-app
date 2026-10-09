import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';

import { ErrorLine, usePosT } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { getApiUrl, getWebUrl } from '@/lib/env';
import { posHeaders, shopPaths } from '@/lib/pos/api';
import { shareCachedFile } from '@/lib/share/share-binary-file';
import {
  fetchPackingSlips,
  joinOrderNames,
  type ReadySlip,
  type SlipOrder,
  slipOrdersInPrintOrder,
  slipRouteMissing,
  webPackingSlipsUrl,
} from '@/lib/shop/packing-slips';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * The Orders list's select-mode bar (UX spec §8.6 `ord.bulk.packingSlips`): how many orders are
 * ticked and "Print packing slips". The web opens one page with every slip; the app fetches each
 * slip's PDF in turn ("Getting packing slip 2 of 5"), then hands them to the share sheet one at a
 * time, because the share sheet takes one file. The first opens straight away; each after it
 * waits for "Share", so the person can stop part way. A slip that fails is named and the rest are
 * still shared. A server without the PDF route (every slip 404) opens the web page instead.
 */

type Phase =
  | { kind: 'idle' }
  | { kind: 'getting'; current: number; total: number }
  | { kind: 'queue'; slips: ReadySlip[]; index: number; sharing: boolean };

const IDLE: Phase = { kind: 'idle' };

export function PackingSlipBar({ selected, accessToken }: { selected: SlipOrder[]; accessToken: string | null }) {
  const t = usePosT();
  const toast = useToast();
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>(IDLE);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopRef.current = true;
    };
  }, []);

  function openOnWeb(ids: string[]) {
    const base = getWebUrl() || 'https://reserve-ni.vercel.app';
    const url = webPackingSlipsUrl(base, ids);
    toast.info(t('app.ord.bulk.web'));
    void WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => undefined));
  }

  async function shareAt(slips: ReadySlip[], index: number) {
    setPhase({ kind: 'queue', slips, index, sharing: true });
    const res = await shareCachedFile(slips[index].uri, { mimeType: 'application/pdf', dialogTitle: t('ord.bulk.packingSlips') });
    if (!mounted.current) return;
    if (!res.ok) {
      setError(t('app.ord.slip.failed'));
      setPhase(IDLE);
      return;
    }
    const next = index + 1;
    setPhase(next < slips.length ? { kind: 'queue', slips, index: next, sharing: false } : IDLE);
  }

  async function print() {
    if (!accessToken || phase.kind !== 'idle' || selected.length === 0) return;
    const orders = slipOrdersInPrintOrder(selected);
    stopRef.current = false;
    setError(null);
    setPhase({ kind: 'getting', current: 1, total: orders.length });
    const result = await fetchPackingSlips({
      orders,
      apiUrl: getApiUrl(),
      headers: { ...posHeaders(), Authorization: `Bearer ${accessToken}` },
      pathFor: shopPaths.packingSlipPdf,
      onProgress: (current, total) => {
        if (mounted.current) setPhase({ kind: 'getting', current, total });
      },
      shouldStop: () => stopRef.current,
    });
    if (!mounted.current) return;
    if (result.stopped) {
      setPhase(IDLE);
      return;
    }
    if (slipRouteMissing(result)) {
      setPhase(IDLE);
      openOnWeb(orders.map((o) => o.id));
      return;
    }
    if (result.failed.length === orders.length) {
      setError(orders.length === 1 ? t('app.ord.slip.failed') : t('app.ord.bulk.allFailed'));
      setPhase(IDLE);
      return;
    }
    if (result.failed.length > 0) {
      const names = joinOrderNames(result.failed.map((f) => t('ord.row.number', { orderNo: f.number })));
      setError(t(result.failed.length === 1 ? 'app.ord.bulk.failedOne' : 'app.ord.bulk.failedMany', { orders: names }));
      // The message stays in view: the first sheet waits for "Share" rather than covering it.
      setPhase(result.ready.length > 0 ? { kind: 'queue', slips: result.ready, index: 0, sharing: false } : IDLE);
      return;
    }
    // In a browser each slip has already downloaded as its own file.
    if (result.ready.length === 0) {
      setPhase(IDLE);
      return;
    }
    await shareAt(result.ready, 0);
  }

  function stop() {
    stopRef.current = true;
    setPhase(IDLE);
  }

  let status: string;
  if (phase.kind === 'getting') status = t('app.ord.bulk.getting', { current: phase.current, total: phase.total });
  else if (phase.kind === 'queue')
    status = t('app.ord.bulk.next', { current: phase.index + 1, total: phase.slips.length, orderNo: phase.slips[phase.index].number });
  else status = selected.length > 0 ? t('app.ord.bulk.count', { count: selected.length }) : t('app.ord.bulk.hint');

  return (
    <View style={[styles.bar, { backgroundColor: colors.surfaceRaised, borderTopColor: colors.border }]}>
      <ErrorLine message={error} />
      <View style={styles.row}>
        {phase.kind === 'getting' ? <ActivityIndicator size="small" color={colors.brand} /> : null}
        <Text variant="label" style={styles.flex} accessibilityLiveRegion="polite">
          {status}
        </Text>
        {phase.kind === 'idle' ? (
          <Button
            label={t('ord.bulk.packingSlips')}
            size="sm"
            disabled={selected.length === 0 || !accessToken}
            onPress={() => void print()}
          />
        ) : null}
        {phase.kind === 'queue' ? (
          <Button
            label={t('app.ord.bulk.share')}
            size="sm"
            loading={phase.sharing}
            disabled={phase.sharing}
            onPress={() => void shareAt(phase.slips, phase.index)}
          />
        ) : null}
        {phase.kind !== 'idle' ? (
          <Button
            label={t('app.ord.bulk.stop')}
            size="sm"
            variant="ghost"
            disabled={phase.kind === 'queue' && phase.sharing}
            onPress={stop}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
