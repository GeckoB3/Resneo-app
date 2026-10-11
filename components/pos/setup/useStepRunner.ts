import { useCallback, useState } from 'react';

import { useSetupNav, type SetupData } from '@/components/pos/setup/SetupFrame';
import { ApiError } from '@/lib/api/client';
import { posErrorMessage } from '@/lib/pos/api';
import { setupT } from '@/lib/pos/setup/copy';
import { stepForScreen, stepState } from '@/lib/pos/setup/flow';
import { useRefreshSetupStatus, useSaveSetupProgress } from '@/lib/queries/usePosSetup';
import { useToast } from '@/providers/ToastProvider';
import type { PosSetupAnswers, PosSetupScreen } from '@/types/pos-setup';

export type StepBusy = 'continue' | 'skip' | null;

/**
 * What every question screen does with its buttons (design 6.4 and 6.5).
 *
 * - `proceed(writes, answers)`: the screen's writes go first, through the routes Checkout settings
 *   uses; a refusal stops there with the server's own sentence. Then the answers are kept with the
 *   progress (a step skipped before goes back to "to do", so its tick comes from the data again),
 *   and the next screen opens.
 * - `skip()`: "Skip for now" marks the step skipped and moves on. Skipping never blocks: when the
 *   mark cannot be saved the owner is told, and moves on all the same.
 */
export function useStepRunner(screen: PosSetupScreen, data: SetupData) {
  const { advance, leave } = useSetupNav(screen);
  const saveProgress = useSaveSetupProgress();
  const refresh = useRefreshSetupStatus();
  const toast = useToast();
  const [busy, setBusy] = useState<StepBusy>(null);
  const [error, setError] = useState<string | null>(null);
  const stepId = stepForScreen(screen);
  const wasSkipped = stepId !== null && stepState(data.status, stepId) === 'skipped';

  const proceed = useCallback(
    async (writes?: (() => Promise<string | null>) | null, answers?: PosSetupAnswers | null) => {
      if (busy) return;
      setBusy('continue');
      setError(null);
      let problem: string | null = null;
      try {
        problem = writes ? await writes() : null;
      } catch (e) {
        // A write the screen did not expect to fail this way: the server's words, or a plain line.
        problem = e instanceof ApiError ? posErrorMessage(e, setupT('setup.error.save')) : setupT('setup.error.save');
      }
      if (problem) {
        setBusy(null);
        setError(problem);
        return;
      }
      const patch = {
        ...(answers ? { answers } : {}),
        ...(wasSkipped && stepId ? { step: { id: stepId, state: 'todo' as const } } : {}),
      };
      if (Object.keys(patch).length > 0) {
        const result = await saveProgress(patch);
        setBusy(null);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        advance(result.status);
        return;
      }
      // Nothing to keep: the step's tick follows the data the writes changed, so read it again.
      await refresh();
      setBusy(null);
      advance();
    },
    [advance, busy, refresh, saveProgress, stepId, wasSkipped],
  );

  const skip = useCallback(async () => {
    if (busy) return;
    if (!stepId) {
      advance();
      return;
    }
    setBusy('skip');
    setError(null);
    const result = await saveProgress({ step: { id: stepId, state: 'skipped' } });
    setBusy(null);
    if (!result.ok) toast.error(result.message);
    advance(result.ok ? result.status : null);
  }, [advance, busy, saveProgress, stepId, toast]);

  return { busy, error, setError, proceed, skip, leave, advance };
}
