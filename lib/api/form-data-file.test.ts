/**
 * `formDataFile`: a multipart file part SDK 56's `expo/fetch` can encode (it refuses React
 * Native's `{ uri, name, type }` with "Unsupported FormDataPart implementation").
 */

const mockBytes = jest.fn(async () => new Uint8Array([1, 2, 3]));
const mockFile = jest.fn();
jest.mock('expo-file-system', () => ({
  File: class {
    constructor(uri: string) {
      mockFile(uri);
    }
    bytes() {
      return mockBytes();
    }
  },
}));

import { formDataFile } from './form-data-file';

const ORIGINAL = process.env.EXPO_PUBLIC_USE_RN_FETCH;

afterEach(() => {
  process.env.EXPO_PUBLIC_USE_RN_FETCH = ORIGINAL;
  mockFile.mockClear();
});

describe('formDataFile', () => {
  it('reads the file through expo-file-system and keeps the given name and type', async () => {
    delete process.env.EXPO_PUBLIC_USE_RN_FETCH;
    const part = formDataFile('file:///cache/a.jpg', 'upload.jpg', 'image/jpeg') as unknown as {
      name: string;
      type: string;
      bytes: () => Promise<Uint8Array>;
      uri?: string;
    };
    expect(mockFile).toHaveBeenCalledWith('file:///cache/a.jpg');
    expect(part.name).toBe('upload.jpg');
    expect(part.type).toBe('image/jpeg');
    expect(part.uri).toBeUndefined();
    await expect(part.bytes()).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  it('keeps React Native’s own shape when its fetch is switched back on', () => {
    process.env.EXPO_PUBLIC_USE_RN_FETCH = '1';
    expect(formDataFile('file:///cache/a.pdf', 'menu.pdf', 'application/pdf')).toEqual({
      uri: 'file:///cache/a.pdf',
      name: 'menu.pdf',
      type: 'application/pdf',
    });
    expect(mockFile).not.toHaveBeenCalled();
  });
});
