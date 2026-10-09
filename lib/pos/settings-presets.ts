import type { PosSettingsDiscountPreset } from '@/types/pos-settings';

/**
 * A preset discount's draft in the editor sheet and the body the presets routes take (web
 * `PresetsCard` in `DiscountsCard.tsx`). The percentage stays as typed text ("12.5"), sent as basis
 * points.
 */

export interface PresetDraft {
  name: string | null;
  kind: 'percent' | 'amount';
  percentText: string;
  amount_pence: number | null;
  applies_to: PosSettingsDiscountPreset['applies_to'];
  max_amount_pence: number | null;
  reason_required: boolean;
  is_active: boolean;
}

export function draftFromPreset(p: PosSettingsDiscountPreset | null): PresetDraft {
  return {
    name: p?.name ?? null,
    kind: p?.kind ?? 'percent',
    percentText: p?.percent_bps != null ? String(p.percent_bps / 100) : '',
    amount_pence: p?.amount_pence ?? null,
    applies_to: p?.applies_to ?? 'all',
    max_amount_pence: p?.max_amount_pence ?? null,
    reason_required: p?.reason_required ?? false,
    is_active: p?.is_active ?? true,
  };
}

/** The body the presets routes take (web `PresetsCard.submit`). */
export function presetBody(draft: PresetDraft) {
  const percent = Number(draft.percentText.replace(',', '.'));
  return {
    name: draft.name ?? '',
    kind: draft.kind,
    percent_bps: draft.kind === 'percent' ? (Number.isFinite(percent) ? Math.round(percent * 100) : null) : null,
    amount_pence: draft.kind === 'amount' ? draft.amount_pence : null,
    applies_to: draft.applies_to,
    max_amount_pence: draft.max_amount_pence,
    reason_required: draft.reason_required,
    is_active: draft.is_active,
  };
}
