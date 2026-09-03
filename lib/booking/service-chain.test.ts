import {
  chainSpanMinutes,
  MAX_SERVICES_PER_VISIT,
  serialiseServiceChainParam,
} from '@/lib/booking/service-chain';

describe('serialiseServiceChainParam', () => {
  it('writes the wire shape web parses, dropping empty optionals', () => {
    const raw = serialiseServiceChainParam([
      { service_id: 'a', variant_id: null, addon_ids: [], duration_minutes: null },
      { service_id: 'b', variant_id: 'v1', addon_ids: ['x', 'y'], duration_minutes: 45 },
    ]);
    expect(JSON.parse(raw)).toEqual([
      { service_id: 'a' },
      { service_id: 'b', variant_id: 'v1', addon_ids: ['x', 'y'], duration_minutes: 45 },
    ]);
  });

  it('caps a visit at four services', () => {
    expect(MAX_SERVICES_PER_VISIT).toBe(4);
  });
});

describe('chainSpanMinutes', () => {
  it('counts inner buffers but not the buffer after the last service', () => {
    expect(
      chainSpanMinutes([
        { durationMinutes: 30, bufferMinutes: 15 },
        { durationMinutes: 45, bufferMinutes: 10 },
        { durationMinutes: 20, bufferMinutes: 30 },
      ]),
    ).toBe(30 + 15 + 45 + 10 + 20);
    expect(chainSpanMinutes([{ durationMinutes: 30, bufferMinutes: 15 }])).toBe(30);
    expect(chainSpanMinutes([])).toBe(0);
  });
});
