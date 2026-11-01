import { createRefreshCoalescer } from './refresh-coalescer';

describe('createRefreshCoalescer', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('turns a burst of changes into one refresh after the quiet window', () => {
    const run = jest.fn();
    const coalescer = createRefreshCoalescer(run, 2_500, 30_000);

    for (let i = 0; i < 500; i += 1) coalescer.note();
    expect(run).not.toHaveBeenCalled();

    jest.advanceTimersByTime(2_500);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('still refreshes during a stream that never goes quiet', () => {
    const run = jest.fn();
    const coalescer = createRefreshCoalescer(run, 2_500, 30_000);

    // One change a second for a minute, as a running import produces.
    for (let i = 0; i < 60; i += 1) {
      coalescer.note();
      jest.advanceTimersByTime(1_000);
    }

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('refreshes again for a change after the last refresh', () => {
    const run = jest.fn();
    const coalescer = createRefreshCoalescer(run, 2_500, 30_000);

    coalescer.note();
    jest.advanceTimersByTime(2_500);
    coalescer.note();
    jest.advanceTimersByTime(2_500);

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('drops a waiting refresh when cancelled', () => {
    const run = jest.fn();
    const coalescer = createRefreshCoalescer(run, 2_500, 30_000);

    coalescer.note();
    coalescer.cancel();
    jest.advanceTimersByTime(60_000);

    expect(run).not.toHaveBeenCalled();
  });
});
