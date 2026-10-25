/**
 * Treatment photos shrink on the phone before they upload (the web's 2,000 px and 85% JPEG), and a
 * build without the native resizer uploads the picker's file as it was.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
let mockNativeModule: object | null = {};
jest.mock('expo', () => ({ requireOptionalNativeModule: () => mockNativeModule }));

const mockRenders: { width: number; height: number }[] = [];
const mockResize = jest.fn();
const mockSave = jest.fn();
jest.mock('expo-image-manipulator', () => {
  const ref = (size: { width: number; height: number }) => ({ ...size, saveAsync: (...args: unknown[]) => mockSave(...args) });
  return {
    SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
    ImageManipulator: {
      manipulate: () => {
        const context = {
          resize: (size: { width: number; height: number }) => {
            mockResize(size);
            mockRenders.unshift(size);
            return context;
          },
          renderAsync: async () => ref(mockRenders.shift()!),
        };
        return context;
      },
    },
  };
});

import { fitWithinMaxEdge, pickerQuality, preparePhotoForUpload } from '@/lib/treatment-records/photo-prepare';

beforeEach(() => {
  mockNativeModule = {};
  mockRenders.length = 0;
  mockResize.mockReset();
  mockSave.mockReset();
  mockSave.mockResolvedValue({ uri: 'file:///resized.jpg', width: 0, height: 0 });
});

describe('fitWithinMaxEdge', () => {
  it('caps the longer edge at 2,000 px and keeps the shape', () => {
    expect(fitWithinMaxEdge(4032, 3024)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithinMaxEdge(3024, 4032)).toEqual({ width: 1500, height: 2000 });
  });

  it('leaves a photo that already fits alone', () => {
    expect(fitWithinMaxEdge(1600, 1200)).toEqual({ width: 1600, height: 1200 });
  });
});

describe('preparePhotoForUpload', () => {
  it('shrinks a large photo by its decoded size and saves it as an 85% JPEG', async () => {
    mockRenders.push({ width: 3024, height: 4032 });
    const out = await preparePhotoForUpload({ uri: 'file:///big.heic', mimeType: 'image/heic' });
    expect(mockResize).toHaveBeenCalledWith({ width: 1500, height: 2000 });
    expect(mockSave).toHaveBeenCalledWith({ compress: 0.85, format: 'jpeg' });
    expect(out).toEqual({ uri: 'file:///resized.jpg', mimeType: 'image/jpeg' });
  });

  it('re-saves a small photo without resizing it, which drops its metadata', async () => {
    mockRenders.push({ width: 1200, height: 900 });
    const out = await preparePhotoForUpload({ uri: 'file:///small.png', mimeType: 'image/png' });
    expect(mockResize).not.toHaveBeenCalled();
    expect(out).toEqual({ uri: 'file:///resized.jpg', mimeType: 'image/jpeg' });
  });

  it('uploads the picker’s file as it was when the resizer fails', async () => {
    mockRenders.push({ width: 4000, height: 3000 });
    mockSave.mockRejectedValue(new Error('out of memory'));
    const out = await preparePhotoForUpload({ uri: 'file:///big.jpg', mimeType: 'image/jpeg' });
    expect(out).toEqual({ uri: 'file:///big.jpg', mimeType: 'image/jpeg' });
  });

  it('uploads the picker’s file as it was in a build without the resizer', async () => {
    mockNativeModule = null;
    expect(pickerQuality()).toBe(0.7);
    const out = await preparePhotoForUpload({ uri: 'file:///big.jpg', mimeType: 'image/jpeg' });
    expect(out).toEqual({ uri: 'file:///big.jpg', mimeType: 'image/jpeg' });
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('marks an unsupported file it could not re-save, so the screen can say so', async () => {
    mockNativeModule = null;
    const out = await preparePhotoForUpload({ uri: 'file:///photo.heic', mimeType: 'image/heic' });
    expect(out.mimeType).toBeNull();
  });
});
