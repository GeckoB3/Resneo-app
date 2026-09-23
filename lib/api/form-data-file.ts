/**
 * A file for a multipart upload, in a shape the app's `fetch` can send.
 *
 * SDK 56's runtime installs `expo/fetch` as the global `fetch` (unless
 * `EXPO_PUBLIC_USE_RN_FETCH` is set, which the app does not do). Its multipart encoder takes a
 * `Blob`, or an object with `bytes()`, and refuses React Native's `{ uri, name, type }` part with
 * "Unsupported FormDataPart implementation", which reaches the caller as a failed network request
 * before anything is sent. A part with `bytes()` goes through, so this reads the file with
 * `expo-file-system`'s `File` and keeps the given name and type. Where the file system is not
 * available (web, tests), or React Native's fetch is switched back on, the `{ uri, name, type }`
 * object is returned.
 */
export function formDataFile(uri: string, name: string, type: string): Blob {
  // The same switch Expo's runtime reads: with React Native's fetch back on, its own shape is right.
  const rnFetch = process.env.EXPO_PUBLIC_USE_RN_FETCH === '1' || process.env.EXPO_PUBLIC_USE_RN_FETCH === 'true';
  if (rnFetch) return { uri, name, type } as unknown as Blob;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { File } = require('expo-file-system') as {
      File?: new (uri: string) => { bytes(): Promise<Uint8Array> };
    };
    if (typeof File === 'function') {
      const file = new File(uri);
      // Expo's encoder takes the part's filename and Content-Type from `name` and `type`, and its
      // body from `bytes()`: the same name and type the `{ uri }` shape carried, which routes that
      // check the type (the image uploads accept only JPEG, PNG and WebP) rely on.
      return { name, type, bytes: () => file.bytes() } as unknown as Blob;
    }
  } catch {
    // Fall through to React Native's own shape.
  }
  return { uri, name, type } as unknown as Blob;
}
