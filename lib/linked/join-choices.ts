/**
 * The answers a venue gives while it decides whether to join a shared-services collective, and
 * how they become the route's body (web `JoinCollectiveDialog.tsx`: `defaultJoinDraft`,
 * `joinChoicesFrom`, `joinStepsFor`). Pure, so the review sheet (accept a link and join) and the
 * join sheet (an invitation on its own) share one set of rules.
 */
import type { JoinChoices, JoinPreview } from '@/types/collectives';

export type JoinStep = 'means' | 'services' | 'forms' | 'check';

export interface JoinDraft {
  sameName: Record<string, 'use_mine' | 'add_new'>;
  optionMap: Record<string, string | null>;
  own: Record<string, 'ask' | 'park'>;
  forms: Record<string, 'use_existing' | 'use_theirs'>;
  /** Turn the venue's forms on as it joins (web 2026-10-28): only ever the venue's own tick. */
  turnOnForms: boolean;
}

/** Forms are off here and services on the page need one: the venue may turn them on as it joins. */
export function joinOffersFormsSwitch(preview: JoinPreview): boolean {
  return preview.warnings.forms_off && preview.warnings.form_services > 0;
}

export const EMPTY_JOIN_DRAFT: JoinDraft = { sameName: {}, optionMap: {}, own: {}, forms: {}, turnOnForms: false };

/**
 * What still stands between guests and this venue once it has joined (web `joinNextSteps`,
 * 2026-10-28): Stripe, when page services take a payment online and it has none; its forms, when
 * they are off, the page needs them, and it did not tick to turn them on as it joined.
 */
export function joinNextSteps(preview: JoinPreview, draft: JoinDraft): { stripe: boolean; forms: boolean } {
  return {
    stripe: preview.warnings.no_stripe_paid_services > 0,
    forms: joinOffersFormsSwitch(preview) && !draft.turnOnForms,
  };
}

const norm = (name: string) => name.trim().toLowerCase();

/**
 * Defaults: use the venue's own same-name service, match options by name, suggest every other
 * service to the host (it adds them all at once, or some, on Manage Collective; web 2026-10-27),
 * keep its forms. An unticked service is parked.
 */
export function defaultJoinDraft(preview: JoinPreview): JoinDraft {
  const optionMap: Record<string, string | null> = {};
  for (const pair of preview.same_name) {
    for (const mine of pair.my_options) {
      optionMap[mine.id] = pair.host_options.find((h) => norm(h.name) === norm(mine.name))?.id ?? null;
    }
  }
  return {
    sameName: Object.fromEntries(preview.same_name.map((s) => [s.item_id, 'use_mine' as const])),
    optionMap,
    own: Object.fromEntries(preview.own_services.map((s) => [s.id, 'ask' as const])),
    forms: Object.fromEntries(preview.forms.map((f) => [f.host_type_id, 'use_existing' as const])),
    // Never ticked for the venue: switching forms on is its own decision (web plan RT2-6).
    turnOnForms: false,
  };
}

export function joinChoicesFrom(preview: JoinPreview, draft: JoinDraft): JoinChoices {
  return {
    same_name_choices: preview.same_name.map((pair) =>
      draft.sameName[pair.item_id] === 'use_mine'
        ? {
            item_id: pair.item_id,
            choice: 'use_mine' as const,
            my_service_id: pair.my_service_id,
            option_map: pair.my_options.map((o) => ({ my_variant_id: o.id, host_variant_id: draft.optionMap[o.id] ?? null })),
          }
        : { item_id: pair.item_id, choice: 'add_new' as const },
    ),
    own_service_choices: Object.entries(draft.own).map(([service_id, choice]) => ({ service_id, choice })),
    form_choices: preview.forms.map((f) =>
      draft.forms[f.host_type_id] === 'use_existing'
        ? { host_type_id: f.host_type_id, choice: 'use_existing' as const, my_type_id: f.my_type_id }
        : { host_type_id: f.host_type_id, choice: 'use_theirs' as const },
    ),
    ...(draft.turnOnForms && joinOffersFormsSwitch(preview) ? { turn_on_forms: true } : {}),
  };
}

/** The steps a preview needs: forms only when the venue holds a matching one. */
export function joinStepsFor(preview: JoinPreview): JoinStep[] {
  return preview.forms.length > 0 ? ['means', 'services', 'forms', 'check'] : ['means', 'services', 'check'];
}

/** Tick or untick every one of the venue's other services at once ("Suggest them all to {host}"). */
export function withAllOwn(preview: JoinPreview, draft: JoinDraft, ask: boolean): JoinDraft {
  return { ...draft, own: Object.fromEntries(preview.own_services.map((s) => [s.id, ask ? 'ask' : 'park'])) };
}

/** True when every one of the venue's other services is ticked to be suggested. */
export function allOwnAsked(preview: JoinPreview, draft: JoinDraft): boolean {
  return preview.own_services.length > 0 && preview.own_services.every((s) => draft.own[s.id] === 'ask');
}

/** The counts the check step summarises. */
export function joinSummaryCounts(draft: JoinDraft): { useMine: number; park: number; ask: number } {
  return {
    useMine: Object.values(draft.sameName).filter((c) => c === 'use_mine').length,
    park: Object.values(draft.own).filter((c) => c === 'park').length,
    ask: Object.values(draft.own).filter((c) => c === 'ask').length,
  };
}
