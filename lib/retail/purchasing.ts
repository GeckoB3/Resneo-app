import type { PosCopyId } from '@/lib/pos/copy';
import { parseMoneyInput, penceToInput } from '@/lib/pos/sale-math';
import { sameBarcode } from '@/lib/retail/scan';
import type { PickerVariant, PurchaseOrderLine, PurchaseOrderStatus } from '@/types/retail';

/**
 * Purchase orders in the app (POS app step 4b, plan P7-15; UX spec §6.13), the pure parts: a draft's
 * lines as typed and as the routes take them, and a delivery as it is scanned or typed in.
 */

export function poStatusId(status: PurchaseOrderStatus): PosCopyId {
  switch (status) {
    case 'draft':
      return 'po.status.draft';
    case 'sent':
      return 'po.status.sent';
    case 'part_received':
      return 'po.status.part_received';
    case 'received':
      return 'po.status.received';
    default:
      return 'po.status.cancelled';
  }
}

export function poStatusTone(status: PurchaseOrderStatus): 'neutral' | 'accent' | 'warning' | 'success' {
  if (status === 'received') return 'success';
  if (status === 'part_received') return 'warning';
  if (status === 'sent') return 'accent';
  return 'neutral';
}

// ─── A draft's lines ─────────────────────────────────────────────────────────

export interface DraftLine {
  variant_id: string;
  name: string;
  sku: string | null;
  qty: string;
  cost: string;
  exists: boolean;
}

export function draftFromLines(lines: PurchaseOrderLine[]): DraftLine[] {
  return lines
    .filter((l) => !l.added_at_receipt)
    .map((l) => ({
      variant_id: l.variant_id,
      name: l.name,
      sku: l.sku,
      qty: String(l.quantity_ordered),
      cost: penceToInput(l.unit_cost_pence),
      exists: l.exists,
    }));
}

/** A product picked for the order: one pack (or one), at its average cost. Already there: one more. */
export function addToDraft(draft: DraftLine[], v: PickerVariant, name: string): DraftLine[] {
  const there = draft.find((l) => l.variant_id === v.variant_id);
  const step = v.pack_size && v.pack_size > 0 ? v.pack_size : 1;
  if (there) {
    const n = Number(there.qty);
    return draft.map((l) => (l === there ? { ...l, qty: String((Number.isFinite(n) ? n : 0) + step) } : l));
  }
  return [
    ...draft,
    {
      variant_id: v.variant_id,
      name,
      sku: v.sku,
      qty: String(step),
      cost: v.cost_pence != null ? penceToInput(Math.round(v.cost_pence)) : '',
      exists: true,
    },
  ];
}

export type DraftProblem = { kind: 'qty' | 'cost'; name: string } | null;

/** The lines as PATCH takes them (`lines` replaces the list), or the first line that is not right. */
export function draftLinesBody(draft: DraftLine[]): {
  lines: { variant_id: string; quantity: number; unit_cost_pence: number | null }[];
  problem: DraftProblem;
} {
  const lines: { variant_id: string; quantity: number; unit_cost_pence: number | null }[] = [];
  for (const l of draft) {
    const qty = l.qty.trim();
    if (!/^\d{1,6}$/.test(qty) || Number(qty) < 1) return { lines: [], problem: { kind: 'qty', name: l.name } };
    let cost: number | null = null;
    if (l.cost.trim()) {
      cost = parseMoneyInput(l.cost);
      if (cost == null) return { lines: [], problem: { kind: 'cost', name: l.name } };
    }
    lines.push({ variant_id: l.variant_id, quantity: Number(qty), unit_cost_pence: cost });
  }
  return { lines, problem: null };
}

/** The draft's total at cost, as typed (lines not yet right count as nothing). */
export function draftTotal(draft: DraftLine[]): number {
  return draft.reduce((sum, l) => {
    const qty = /^\d+$/.test(l.qty.trim()) ? Number(l.qty.trim()) : 0;
    const cost = parseMoneyInput(l.cost) ?? 0;
    return sum + qty * cost;
  }, 0);
}

/** Whether the typed draft differs from the order as saved. */
export function draftChanged(draft: DraftLine[], saved: PurchaseOrderLine[]): boolean {
  const base = draftFromLines(saved);
  if (base.length !== draft.length) return true;
  return draft.some((l, i) => {
    const b = base[i]!;
    return (
      b.variant_id !== l.variant_id ||
      Number(b.qty) !== Number(l.qty.trim()) ||
      (parseMoneyInput(b.cost) ?? null) !== (l.cost.trim() ? parseMoneyInput(l.cost) : null)
    );
  });
}

// ─── Receiving a delivery ────────────────────────────────────────────────────

/** Still to come on a line (never below zero). */
export function stillToCome(l: Pick<PurchaseOrderLine, 'quantity_ordered' | 'quantity_received'>): number {
  return Math.max(0, l.quantity_ordered - l.quantity_received);
}

/** The order line a scanned or typed code names: a barcode in any of its forms, or the SKU. */
export function receiveLineForCode(lines: PurchaseOrderLine[], code: string): PurchaseOrderLine | null {
  const c = code.trim();
  if (!c) return null;
  const lc = c.toLowerCase();
  return (
    lines.find((l) => l.barcodes.some((b) => sameBarcode(b, c)) || (l.sku !== null && l.sku.trim().toLowerCase() === lc)) ?? null
  );
}

export interface ExtraDraft {
  variant_id: string;
  name: string;
  qty: string;
  cost: string;
}

export type ReceiveProblem = { kind: 'qty' | 'cost' | 'nothing'; name: string | null } | null;

/**
 * The receipt as the route takes it: every line with a quantity (zero is left out), its unit cost
 * when one was typed (the order's otherwise), and the extras. At least one unit must arrive.
 */
export function receiveBody(
  lines: PurchaseOrderLine[],
  qty: Record<string, string>,
  cost: Record<string, string>,
  extras: ExtraDraft[],
): {
  lines: { line_id: string; quantity: number; unit_cost_pence?: number }[];
  extras: { variant_id: string; quantity: number; unit_cost_pence?: number }[];
  units: number;
  problem: ReceiveProblem;
} {
  const out: { line_id: string; quantity: number; unit_cost_pence?: number }[] = [];
  const extraOut: { variant_id: string; quantity: number; unit_cost_pence?: number }[] = [];
  let units = 0;
  const empty = { lines: [], extras: [], units: 0 };
  for (const l of lines) {
    const raw = (qty[l.id] ?? '').trim();
    if (!raw) continue;
    if (!/^\d{1,6}$/.test(raw)) return { ...empty, problem: { kind: 'qty', name: l.name } };
    const n = Number(raw);
    if (n === 0) continue;
    const c = (cost[l.id] ?? '').trim();
    let pence: number | undefined;
    if (c) {
      const p = parseMoneyInput(c);
      if (p == null) return { ...empty, problem: { kind: 'cost', name: l.name } };
      if (p !== l.unit_cost_pence) pence = p;
    }
    out.push({ line_id: l.id, quantity: n, ...(pence != null ? { unit_cost_pence: pence } : {}) });
    units += n;
  }
  for (const e of extras) {
    const raw = e.qty.trim();
    if (!/^\d{1,6}$/.test(raw)) return { ...empty, problem: { kind: 'qty', name: e.name } };
    const n = Number(raw);
    if (n === 0) continue;
    let pence: number | undefined;
    if (e.cost.trim()) {
      const p = parseMoneyInput(e.cost);
      if (p == null) return { ...empty, problem: { kind: 'cost', name: e.name } };
      pence = p;
    }
    extraOut.push({ variant_id: e.variant_id, quantity: n, ...(pence != null ? { unit_cost_pence: pence } : {}) });
    units += n;
  }
  if (units <= 0) return { ...empty, problem: { kind: 'nothing', name: null } };
  return { lines: out, extras: extraOut, units, problem: null };
}

/** How many more than still to come a typed quantity is (`po.receive.over`), or 0. */
export function overBy(l: Pick<PurchaseOrderLine, 'quantity_ordered' | 'quantity_received'>, typed: string): number {
  const raw = typed.trim();
  if (!/^\d+$/.test(raw)) return 0;
  return Math.max(0, Number(raw) - stillToCome(l));
}

/** "Product, option" for a picker row (the picker sends them apart). */
export function pickerLabel(v: Pick<PickerVariant, 'product_name' | 'option_name'>): string {
  return v.option_name ? `${v.product_name}, ${v.option_name}` : v.product_name;
}
