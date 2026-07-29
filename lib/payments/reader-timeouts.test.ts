import {
  ReaderTimeoutError,
  READER_DISCOVERY_TIMEOUT_MS,
  timeoutSignal,
  withTimeout,
} from '@/lib/payments/reader-timeouts';

/**
 * The two helpers that stand between a stalled SDK call and a spinner staff
 * cannot escape (see the file header for why the SDK stalls at all).
 */

describe('withTimeout', () => {
  it('passes a normal result straight through', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1_000, 'too slow')).resolves.toBe('ok');
  });

  it('passes a genuine failure through unchanged', async () => {
    const boom = new Error('reader is switched off');
    await expect(withTimeout(Promise.reject(boom), 1_000, 'too slow')).rejects.toThrow(
      'reader is switched off',
    );
  });

  it('rejects with the staff-facing message when the work never settles', async () => {
    jest.useFakeTimers();
    try {
      const pending = withTimeout(new Promise(() => {}), 5_000, 'The reader did not respond.');
      const assertion = expect(pending).rejects.toThrow(ReaderTimeoutError);
      jest.advanceTimersByTime(5_001);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not leave the loser of the race as an unhandled rejection', async () => {
    // A stalled SDK call that eventually errors, long after the timeout won, must
    // not surface as a red-box unhandled promise rejection on a live counter.
    jest.useFakeTimers();
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      let failLate: ((e: Error) => void) | undefined;
      const work = new Promise<never>((_, reject) => {
        failLate = reject;
      });
      const raced = withTimeout(work, 1_000, 'too slow');
      jest.advanceTimersByTime(1_001);
      await expect(raced).rejects.toThrow('too slow');
      failLate?.(new Error('the SDK gave up too'));
      await Promise.resolve();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
      jest.useRealTimers();
    }
  });

  it('clears its timer as soon as the race settles', async () => {
    // A pending timer keeps a Jest worker alive and wakes the device's JS thread.
    jest.useFakeTimers();
    try {
      await withTimeout(Promise.resolve('ok'), READER_DISCOVERY_TIMEOUT_MS, 'too slow');
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('timeoutSignal', () => {
  it('resolves as a branchable outcome rather than throwing', async () => {
    jest.useFakeTimers();
    try {
      const { signal } = timeoutSignal(2_000);
      jest.advanceTimersByTime(2_001);
      await expect(signal).resolves.toBe('timeout');
    } finally {
      jest.useRealTimers();
    }
  });

  it('can be cancelled when another branch of the race wins', async () => {
    jest.useFakeTimers();
    try {
      const { cancel } = timeoutSignal(2_000);
      cancel();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
