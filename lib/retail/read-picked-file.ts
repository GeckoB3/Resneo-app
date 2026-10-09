import { Platform } from 'react-native';

/**
 * Reads a picked file's text (the product import's CSV). `expo-file-system`'s legacy reader takes
 * the picker's `file://` copy and an Android `content://` link alike; the newer `File` class is
 * the fallback. Throws when neither can read it.
 */
export async function readPickedFileText(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    return res.text();
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const legacy = require('expo-file-system/legacy') as { readAsStringAsync?: (uri: string) => Promise<string> };
    if (typeof legacy?.readAsStringAsync === 'function') return await legacy.readAsStringAsync(uri);
  } catch {
    // Fall through to the File class.
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { File } = require('expo-file-system') as { File?: new (uri: string) => { text(): Promise<string> } };
  if (typeof File !== 'function') throw new Error('No file reader');
  return new File(uri).text();
}
