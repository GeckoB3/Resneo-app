/**
 * The shared optional-update store (READER-8) on its own: the edges the hook suite does not reach.
 */
import {
  __resetReaderSoftwareUpdateForTests,
  getReaderUpdateState,
  installReaderUpdate,
  isReaderUpdateInstalling,
  noteAvailableUpdate,
  noteInstallFinished,
  noteInstallProgress,
  noteInstallStarted,
  noteReaderConnectStarted,
  READER_UPDATE_FAILED_MESSAGE,
  READER_UPDATE_NOT_STARTED_MESSAGE,
  READER_UPDATE_START_TIMEOUT_MS,
  readerBatteryTooLowForUpdate,
} from '@/lib/payments/reader-software-update';

const UPDATE = { deviceSoftwareVersion: '2.1.0', estimatedUpdateTime: 'estimate1To2Minutes' };
const sdk = () => ({ installAvailableUpdate: jest.fn(async () => ({})) });

beforeEach(() => {
  __resetReaderSoftwareUpdateForTests();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('reader software update store', () => {
  it('says so when the reader never starts installing', async () => {
    jest.useFakeTimers();
    noteAvailableUpdate(UPDATE);
    await installReaderUpdate(sdk(), 0.9);
    expect(isReaderUpdateInstalling()).toBe(true);

    jest.advanceTimersByTime(READER_UPDATE_START_TIMEOUT_MS);

    expect(getReaderUpdateState().phase).toBe('failed');
    expect(getReaderUpdateState().failure).toBe(READER_UPDATE_NOT_STARTED_MESSAGE);
    // A start that turns up late still counts.
    noteInstallStarted();
    expect(getReaderUpdateState().phase).toBe('installing');
  });

  it('does not time out once the install has started', async () => {
    jest.useFakeTimers();
    noteAvailableUpdate(UPDATE);
    await installReaderUpdate(sdk(), 0.9);
    noteInstallStarted();
    jest.advanceTimersByTime(READER_UPDATE_START_TIMEOUT_MS * 3);
    expect(getReaderUpdateState().phase).toBe('installing');
  });

  it('reads progress sent as a string and keeps it between 0 and 1', async () => {
    noteAvailableUpdate(UPDATE);
    await installReaderUpdate(sdk(), null);
    noteInstallProgress('0.25');
    expect(getReaderUpdateState().progress).toBe(0.25);
    noteInstallProgress('1.7');
    expect(getReaderUpdateState().progress).toBe(1);
    noteInstallProgress('not a number');
    expect(getReaderUpdateState().progress).toBe(1);
  });

  it('fails plainly when the SDK refuses to start', async () => {
    noteAvailableUpdate(UPDATE);
    const refusing = {
      installAvailableUpdate: jest.fn(async () => ({ error: { code: 'READER_BUSY', message: 'busy' } as never })),
    };
    expect(await installReaderUpdate(refusing, 0.9)).toBe(false);
    expect(getReaderUpdateState().failure).toBe(READER_UPDATE_FAILED_MESSAGE);
    expect(isReaderUpdateInstalling()).toBe(false);
  });

  it('starts nothing with no update reported', async () => {
    const s = sdk();
    expect(await installReaderUpdate(s, 0.9)).toBe(false);
    expect(s.installAvailableUpdate).not.toHaveBeenCalled();
  });

  it('drops the offer once a required update has installed inside a connect', () => {
    noteAvailableUpdate(UPDATE);
    noteInstallFinished({ update: UPDATE });
    expect(getReaderUpdateState().available).toBeNull();
    expect(getReaderUpdateState().phase).toBe('idle');
  });

  it('leaves an install in progress alone when a connect starts', async () => {
    noteAvailableUpdate(UPDATE);
    await installReaderUpdate(sdk(), 0.9);
    noteReaderConnectStarted();
    expect(isReaderUpdateInstalling()).toBe(true);
  });

  it('treats an unknown battery level as enough (the SDK still refuses if not)', () => {
    expect(readerBatteryTooLowForUpdate(null)).toBe(false);
    expect(readerBatteryTooLowForUpdate(0.49)).toBe(true);
    expect(readerBatteryTooLowForUpdate(0.5)).toBe(false);
  });
});
