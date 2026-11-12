/**
 * The one check of a follow-on group's input, ported word for word from the web
 * (`src/lib/follow-ons/group-input.ts`), so the editor sheet refuses what the routes refuse, in the
 * same words, before it sends anything.
 * @see _reference/Resneo/src/lib/follow-ons/group-input.ts
 */

import { DEFAULT_FOLLOW_ON_QUESTION } from './rules';

/** The question clients see when the venue leaves it empty (plan 4.4); one copy, in the rules. */
export { DEFAULT_FOLLOW_ON_QUESTION };

/** The longest name and question the database accepts (20270430120000). */
export const FOLLOW_ON_NAME_MAX = 120;
export const FOLLOW_ON_QUESTION_MAX = 300;

/** The question a group asks: its own, or the default when it has none. */
export function followOnQuestion(prompt: string | null | undefined): string {
  return prompt?.trim() || DEFAULT_FOLLOW_ON_QUESTION;
}

/**
 * Why a group cannot be saved, in words the owner can act on, or null when it can. The server
 * refuses the same things.
 */
export function followOnGroupInputProblem(input: {
  name: string;
  prompt_to_client?: string | null;
  offered_service_ids: readonly string[];
  trigger_service_ids: readonly string[];
}): string | null {
  const name = input.name.trim();
  if (!name) return 'Give the group a name.';
  if (name.length > FOLLOW_ON_NAME_MAX) return `Keep the name to ${FOLLOW_ON_NAME_MAX} characters or fewer.`;
  const question = input.prompt_to_client?.trim() ?? '';
  if (question.length > FOLLOW_ON_QUESTION_MAX) {
    return `Keep the question to ${FOLLOW_ON_QUESTION_MAX} characters or fewer.`;
  }
  if (input.offered_service_ids.length === 0) return 'Choose at least one service to offer.';
  if (new Set(input.offered_service_ids).size !== input.offered_service_ids.length) {
    return 'Each service can be offered once.';
  }
  if (new Set(input.trigger_service_ids).size !== input.trigger_service_ids.length) {
    return 'Each service can be listed once under "Ask after these services".';
  }
  const offered = new Set(input.offered_service_ids);
  if (input.trigger_service_ids.some((id) => offered.has(id))) {
    return 'A service cannot be both offered and asked after in the same group.';
  }
  return null;
}
