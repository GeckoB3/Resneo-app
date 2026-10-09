import { parseMoneyInput } from '@/lib/pos/sale-math';
import type { SupplierBody } from '@/lib/queries/useStockSetup';

/**
 * The supplier editor's form and the body it sends (UX spec §6.12), as the web's `SupplierSheet`
 * checks it: a name; a delivery time of 0 to 365 whole days or none; a minimum order as money or
 * none. Blank fields are sent as null.
 */

export interface SupplierForm {
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  account_number: string;
  lead_time_days: string;
  min_order: string;
  notes: string;
}

export interface SupplierWords {
  nameRequired: string;
  minOrderInvalid: string;
  leadTimeInvalid: string;
}

const blank = (s: string) => (s.trim() ? s.trim() : null);

export function supplierBody(f: SupplierForm, words: SupplierWords): { body: SupplierBody | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!f.name.trim()) errors.name = words.nameRequired;
  let min: number | null = null;
  if (f.min_order.trim()) {
    min = parseMoneyInput(f.min_order);
    if (min == null) errors.min_order = words.minOrderInvalid;
  }
  const leadRaw = f.lead_time_days.trim();
  const lead = leadRaw === '' ? null : Number(leadRaw);
  if (lead !== null && (!/^\d+$/.test(leadRaw) || !Number.isInteger(lead) || lead < 0 || lead > 365)) {
    errors.lead_time_days = words.leadTimeInvalid;
  }
  if (Object.keys(errors).length > 0) return { body: null, errors };
  return {
    body: {
      name: f.name.trim(),
      contact_name: blank(f.contact_name),
      email: blank(f.email),
      phone: blank(f.phone),
      account_number: blank(f.account_number),
      lead_time_days: lead,
      min_order_pence: min,
      notes: blank(f.notes),
    },
    errors,
  };
}
