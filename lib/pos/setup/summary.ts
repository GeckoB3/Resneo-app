import { setupT, type SetupCopyId } from '@/lib/pos/setup/copy';
import type { PosSetupAnswers, PosSetupStatus, PosSetupStepId } from '@/types/pos-setup';
import type { PosTipRule } from '@/types/pos-settings';

/**
 * W12's "Here's what's set up:" (design 6.3, drawn as B14), the web's `summaryLines`
 * (`src/components/pos/setup/DoneStep.tsx`) line for line: from real data (a step done) and the
 * answers that say how ("Cards on Sam's iPhone", "Cash, counted at the end of the day", "Tips,
 * shared by how much each person did"). Pure, so it is tested without the screen.
 */
export function summaryLines(status: Pick<PosSetupStatus, 'steps' | 'phones'>, answers: PosSetupAnswers, tipRule: PosTipRule): string[] {
  const done = (id: PosSetupStepId) => status.steps.some((s) => s.id === id && s.applies && s.state === 'done');
  const lines: string[] = [];
  if (done('cards')) {
    const phone = status.phones?.ready?.[0];
    const cards = answers.cards ?? null;
    if ((cards === 'phone' || cards === 'both') && phone) lines.push(setupT('setup.done.line.cards.phone', { name: phone.name, device: phone.device }));
    else if (cards === 'reader') lines.push(setupT('setup.done.line.cards.reader'));
    else if (cards === 'links') lines.push(setupT('setup.done.line.cards.links'));
    else if (answers.pay?.other_machine && !answers.pay.card) lines.push(setupT('setup.done.line.cards.other'));
    else lines.push(setupT('setup.done.line.cards.inPerson'));
  }
  if (answers.pay?.cash) lines.push(setupT(answers.pay.count_cash ? 'setup.done.line.cash.count' : 'setup.done.line.cash'));
  if (done('tips')) {
    lines.push(answers.tips === 'yes' ? setupT(`setup.done.line.tips.${tipRule}` as SetupCopyId) : setupT('setup.done.line.tips.off'));
  }
  const simple: [PosSetupStepId, SetupCopyId][] = [
    ['details', 'setup.done.line.details'],
    ['team', 'setup.done.line.team'],
    ['products', 'setup.done.line.products'],
    ['vouchers', 'setup.done.line.vouchers'],
    ['loyalty', 'setup.done.line.loyalty'],
    ['shop', 'setup.done.line.shop'],
    ['practice', 'setup.done.line.practice'],
  ];
  for (const [id, copy] of simple) if (done(id)) lines.push(setupT(copy));
  return lines;
}
