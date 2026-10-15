import { FieldBlock, SwitchRow } from '@/components/pos/settings-more/parts';
import { ChoiceChips } from '@/components/pos/parts';
import { Input } from '@/components/ui/Input';
import { splitsT } from '@/lib/commission/splits-copy';
import { BASES, basisWords, checkPercent } from '@/lib/commission/splits-format';
import type { CommissionBasis } from '@/types/commission-splits';

/** The terms being written: the shares as typed, whether products count, and the VAT basis. */
export interface TermsDraft {
  services: string;
  includeProducts: boolean;
  products: string;
  vat: CommissionBasis;
}

/** What the draft sends, or the field messages when a share is not a percentage. */
export type TermsCheck =
  | { ok: true; services: number; products: number | null }
  | { ok: false; services: string | null; products: string | null };

/** The shares as numbers (the routes take percentages), or what is wrong with each. */
export function checkTerms(draft: TermsDraft): TermsCheck {
  const services = checkPercent(draft.services);
  const products = draft.includeProducts ? checkPercent(draft.products) : null;
  if (!services.ok || (products && !products.ok)) {
    return {
      ok: false,
      services: services.ok ? null : services.message,
      products: products && !products.ok ? products.message : null,
    };
  }
  return { ok: true, services: services.value, products: products && products.ok ? products.value : null };
}

/** The draft's shares for the worked example, or null while either is not a percentage yet. */
export function draftRates(draft: TermsDraft): { services: number; products: number | null } | null {
  const check = checkTerms(draft);
  return check.ok ? { services: check.services, products: check.products } : null;
}

/**
 * The share fields the propose form and "Propose new terms" share (web `form.services`,
 * `form.products`, `form.productsRate`, `form.vat`), each with its message beside it: the app's own
 * check, or the field the server named.
 */
export function TermsFields({
  draft,
  onChange,
  errors,
}: {
  draft: TermsDraft;
  onChange: (next: TermsDraft) => void;
  errors: { services?: string | null; products?: string | null; vat?: string | null };
}) {
  return (
    <>
      <FieldBlock label={splitsT('form.services')} error={errors.services}>
        <Input
          value={draft.services}
          onChangeText={(services) => onChange({ ...draft, services })}
          keyboardType="decimal-pad"
          accessibilityLabel={splitsT('form.services')}
        />
      </FieldBlock>
      <SwitchRow
        label={splitsT('form.products')}
        help={splitsT('form.products.help')}
        value={draft.includeProducts}
        onChange={(includeProducts) => onChange({ ...draft, includeProducts })}
      />
      {draft.includeProducts ? (
        <FieldBlock label={splitsT('form.productsRate')} error={errors.products}>
          <Input
            value={draft.products}
            onChangeText={(products) => onChange({ ...draft, products })}
            keyboardType="decimal-pad"
            accessibilityLabel={splitsT('form.productsRate')}
          />
        </FieldBlock>
      ) : null}
      <FieldBlock label={splitsT('form.vat')} help={splitsT('form.vat.help')} error={errors.vat}>
        <ChoiceChips<CommissionBasis>
          options={BASES.map((b) => ({ value: b, label: basisWords(b) }))}
          value={draft.vat}
          onChange={(vat) => onChange({ ...draft, vat })}
        />
      </FieldBlock>
    </>
  );
}
