import { TR_COPY } from '@/lib/treatment-records/copy';
import { formatDay, formatTime } from '@/lib/treatment-records/format';
import type { TreatmentProductLine, TreatmentRecordDetail, TreatmentRecordSaveResult, TreatmentRecordSummary } from '@/types/treatment-records';

/**
 * The editor's draft and what an autosave sends (web plan §8, the same rules as the web editor):
 * the notes and products are typed here; the service, practitioner and time come from the booking
 * or the record and are changed on the web.
 */
export interface TreatmentDraft {
  note: string;
  products: TreatmentProductLine[];
}

export const emptyProduct = (): TreatmentProductLine => ({
  product_name: '',
  batch_number: null,
  expiry_date: null,
  amount: null,
  unit: null,
  area: null,
});

/** The product lines a save sends: rows with a product name, trimmed, in the server's shape. */
export function savedProducts(lines: TreatmentProductLine[]): TreatmentProductLine[] {
  return lines
    .filter((l) => l.product_name.trim())
    .map((l) => ({
      product_name: l.product_name.trim(),
      batch_number: l.batch_number?.trim() || null,
      expiry_date: l.expiry_date?.trim() || null,
      amount: l.amount == null || Number.isNaN(l.amount) ? null : l.amount,
      unit: l.unit ?? null,
      area: l.area?.trim() || null,
    }));
}

export function sameProducts(a: TreatmentProductLine[], b: TreatmentProductLine[]): boolean {
  return JSON.stringify(savedProducts(a)) === JSON.stringify(savedProducts(b));
}

export function draftFromDetail(detail: TreatmentRecordDetail): TreatmentDraft {
  return { note: detail.record.note, products: detail.products.map((p) => ({ ...p })) };
}

/** The keys an autosave sends, or null when nothing differs from the last save. */
export function changesBetween(saved: TreatmentDraft, current: TreatmentDraft): Record<string, unknown> | null {
  const changes: Record<string, unknown> = {};
  if (current.note !== saved.note) changes.note = current.note;
  if (!sameProducts(current.products, saved.products)) changes.products = savedProducts(current.products);
  return Object.keys(changes).length === 0 ? null : changes;
}

/** The record fields an autosave answers with, ready to merge into the open record. */
export function savedRecordFields(out: TreatmentRecordSaveResult): Partial<TreatmentRecordDetail['record']> {
  return {
    version: out.version,
    ...(out.updated_at ? { updated_at: out.updated_at } : {}),
    ...(out.version_count !== undefined ? { version_count: out.version_count } : {}),
    ...(out.last_edited_at ? { last_edited_at: out.last_edited_at, last_edited_by_name: out.last_edited_by_name ?? null } : {}),
  };
}

/** "Copy from last record" is offered only while a new record holds nothing, or only its starter text. */
export function canOfferCopy(draft: TreatmentDraft, starterText: string | null | undefined): boolean {
  return draft.note.trim() === (starterText ?? '').trim() && savedProducts(draft.products).length === 0;
}

/** The booking card's summary line (web plan Appendix A). */
export function bookingSummaryLine(records: TreatmentRecordSummary[], timeZone: string | null | undefined): string {
  if (records.length === 0) return TR_COPY.summaryNone;
  if (records.length > 1) return TR_COPY.summarySeveral(records.length);
  const r = records[0]!;
  const author = r.author_name ?? 'A team member';
  if (r.version_count > 0 && r.last_edited_by_name && r.last_edited_by_name !== author) {
    return TR_COPY.summaryEdited(author, r.last_edited_by_name);
  }
  return TR_COPY.summaryOne(author, formatDay(r.created_at, timeZone), formatTime(r.created_at, timeZone));
}

/** "14 Oct 2026: Lip filler" plus who and what, for a list row. */
export function recordListLines(r: TreatmentRecordSummary, timeZone: string | null | undefined): { title: string; meta: string } {
  const title = `${formatDay(r.treated_at, timeZone)}${r.service_name ? `: ${r.service_name}` : ''}`;
  const meta = [
    r.practitioner_name,
    `${r.author_name ?? 'A team member'}${r.author_venue_name ? ` (${r.author_venue_name})` : ''}`,
    r.product_count ? `${r.product_count} product${r.product_count === 1 ? '' : 's'}` : null,
    r.photo_count ? `${r.photo_count} photo${r.photo_count === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return { title, meta };
}

/** The photo's type, from the picker or its file name; null for anything but JPEG or PNG. */
export function photoMimeType(reported: string | null | undefined, uri: string): 'image/jpeg' | 'image/png' | null {
  const type = (reported ?? '').toLowerCase();
  if (type === 'image/jpeg' || type === 'image/jpg') return 'image/jpeg';
  if (type === 'image/png') return 'image/png';
  if (type) return null;
  const ext = uri.split('?')[0]!.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  return null;
}
