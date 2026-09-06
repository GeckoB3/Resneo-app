import { columnMoveGroup, columnMoveRanges } from '@/lib/calendar/column-move-groups';

describe('columnMoveRanges', () => {
  it('spans every own column, each partner on its own, and leaves a venue-level column alone', () => {
    const ranges = columnMoveRanges([
      {}, // own-a
      {}, // own-b
      { linked: true, moveGroup: 'v1' }, // linked:v1:p1
      { linked: true, moveGroup: 'v1' }, // linked:v1:p2
      { linked: true }, // linked:v1, the venue-level column
      { linked: true, moveGroup: 'v2' }, // linked:v2:p1
    ]);
    expect(ranges).toEqual([
      { min: 0, max: 1 },
      { min: 0, max: 1 },
      { min: 2, max: 3 },
      { min: 2, max: 3 },
      { min: 4, max: 4 },
      { min: 5, max: 5 },
    ]);
  });

  it('gives a single own column a range of itself', () => {
    expect(columnMoveRanges([{}])).toEqual([{ min: 0, max: 0 }]);
  });

  it('keys own columns together and partners by venue', () => {
    expect(columnMoveGroup({})).toBe('own');
    expect(columnMoveGroup({ linked: true, moveGroup: 'v1' })).toBe('linked:v1');
    expect(columnMoveGroup({ linked: true })).toBeNull();
  });
});
