import {
  readAndClearRebookBootstrap,
  resetRebookBootstrapGuard,
  writeRebookBootstrap,
  type RebookBootstrapPayload,
} from '@/lib/rebook-bootstrap';

/**
 * Rebook bootstrap one-shot handoff (pure). Backed by an in-memory stub of
 * expo-secure-store so we can exercise the write → read-and-clear → consume
 * lifecycle without a native module. The module keeps a process-level guard so
 * the payload is only resolved once; resetRebookBootstrapGuard() clears it
 * between scenarios.
 */

// In-memory SecureStore — the real module is native-only and unavailable in jest.
// `mock`-prefixed so jest's hoisted factory may reference it (see jest.mock docs).
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

beforeEach(() => {
  mockStore.clear();
  resetRebookBootstrapGuard();
});

describe('writeRebookBootstrap + readAndClearRebookBootstrap', () => {
  it('round-trips a payload with a populated appointment (service/practitioner/variant/guest)', async () => {
    const payload: RebookBootstrapPayload = {
      v: 1,
      appointment: {
        serviceId: 'svc_1',
        practitionerId: 'prac_1',
        variantId: 'var_1',
        durationMinutes: 45,
      },
      guest: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        phone: '+447700900000',
      },
      initialDate: '2026-06-20',
    };

    await writeRebookBootstrap(payload);
    const read = await readAndClearRebookBootstrap();

    expect(read).toEqual(payload);
    expect(read?.appointment?.serviceId).toBe('svc_1');
    expect(read?.appointment?.practitionerId).toBe('prac_1');
    expect(read?.appointment?.variantId).toBe('var_1');
    expect(read?.appointment?.durationMinutes).toBe(45);
    expect(read?.guest.firstName).toBe('Ada');
    expect(read?.initialDate).toBe('2026-06-20');
  });

  it('round-trips the guest-only fallback (no appointment branch)', async () => {
    const payload: RebookBootstrapPayload = {
      v: 1,
      guest: {
        firstName: 'Grace',
        lastName: 'Hopper',
        email: null,
        phone: null,
      },
    };

    await writeRebookBootstrap(payload);
    const read = await readAndClearRebookBootstrap();

    expect(read).toEqual(payload);
    expect(read?.appointment).toBeUndefined();
    expect(read?.guest.lastName).toBe('Hopper');
  });

  it('clears the stored payload after the first read (consumed once)', async () => {
    await writeRebookBootstrap({ v: 1, guest: { firstName: 'Once' } });

    const first = await readAndClearRebookBootstrap();
    expect(first?.guest.firstName).toBe('Once');

    // Same process, guard not reset: returns the cached resolution, but the
    // backing store has been emptied so a fresh consumer would see nothing.
    expect(mockStore.size).toBe(0);

    resetRebookBootstrapGuard();
    const afterReset = await readAndClearRebookBootstrap();
    expect(afterReset).toBeNull();
  });

  it('returns null when nothing was written', async () => {
    expect(await readAndClearRebookBootstrap()).toBeNull();
  });

  it('ignores a payload with an unexpected version', async () => {
    // A future/legacy schema must not be consumed as a v1 payload.
    await writeRebookBootstrap({ v: 2 as 1, guest: { firstName: 'Future' } });
    expect(await readAndClearRebookBootstrap()).toBeNull();
  });
});
