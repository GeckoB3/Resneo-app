import { resizePaintPieces, shiftBufferBand, trimPaintRegions } from './resize-paint';

describe('resizePaintPieces', () => {
  it('returns the pieces untouched when the height has not changed', () => {
    const pieces = [{ top: 0, height: 60 }];
    expect(resizePaintPieces(pieces, 60, 60)).toBe(pieces);
  });

  it('grows the trailing piece with the bottom edge', () => {
    expect(resizePaintPieces([{ top: 0, height: 60 }], 60, 90)).toEqual([{ top: 0, height: 90 }]);
  });

  it('grows only the last piece of a bar with a middle hole', () => {
    // Busy 0..30, hole 30..45, busy 45..60.
    const pieces = [
      { top: 0, height: 30 },
      { top: 45, height: 15 },
    ];
    expect(resizePaintPieces(pieces, 60, 75)).toEqual([
      { top: 0, height: 30 },
      { top: 45, height: 30 },
    ]);
  });

  it('leaves a trailing free hole to grow when the last piece stops short of the end', () => {
    // Old shape: core 120 with a free hole 60..120; the box grows, the piece does not.
    const pieces = [{ top: 0, height: 60 }];
    expect(resizePaintPieces(pieces, 120, 150)).toEqual([{ top: 0, height: 60 }]);
  });

  it('trims the trailing piece on a shrink so its corner stays inside the bar', () => {
    expect(resizePaintPieces([{ top: 0, height: 60 }], 60, 45)).toEqual([{ top: 0, height: 45 }]);
  });

  it('drops a piece the new end cuts off entirely', () => {
    const pieces = [
      { top: 0, height: 30 },
      { top: 45, height: 15 },
    ];
    expect(resizePaintPieces(pieces, 60, 40)).toEqual([{ top: 0, height: 30 }]);
  });
});

describe('trimPaintRegions', () => {
  it('clamps segments and free taps to the new end and drops the ones beyond it', () => {
    const regions = [
      { top: 0, height: 30, serviceName: 'Cut' },
      { top: 30, height: 30, serviceName: 'Colour' },
      { top: 60, height: 30, serviceName: 'Blow dry' },
    ];
    expect(trimPaintRegions(regions, 45)).toEqual([
      { top: 0, height: 30, serviceName: 'Cut' },
      { top: 30, height: 15, serviceName: 'Colour' },
    ]);
  });
});

describe('shiftBufferBand', () => {
  it('moves the band with the bottom edge', () => {
    expect(shiftBufferBand({ top: 60, height: 10 }, 60, 90)).toEqual({ top: 90, height: 10 });
    expect(shiftBufferBand({ top: 60, height: 10 }, 60, 45)).toEqual({ top: 45, height: 10 });
  });

  it('passes a missing band through', () => {
    expect(shiftBufferBand(null, 60, 90)).toBeNull();
    expect(shiftBufferBand(undefined, 60, 90)).toBeUndefined();
  });
});
