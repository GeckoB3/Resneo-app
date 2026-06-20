/**
 * Runtime polyfills — imported for side effects at the very top of the root
 * layout, so the globals exist before any screen module renders.
 *
 * **TextEncoder.** Hermes / React Native 0.85 (Expo SDK 56) does not expose a
 * global `TextEncoder`. The `qrcode` package (pulled in by react-native-qrcode-svg,
 * rendered on the Booking-page editor's QR card) calls `new TextEncoder().encode()`
 * to build the QR matrix — without the global it threw `TextEncoder is not defined`
 * and white-screened the whole screen. react-native-qrcode-svg only ships its own
 * polyfill for RN < 0.75, so we install one here. `TextEncoder` is UTF-8-only by
 * spec, so this small encoder fully satisfies that contract. Guarded so it never
 * replaces a runtime that already provides one (Node/jest, or a future Hermes).
 */

type GlobalWithEncoder = { TextEncoder?: unknown };
const globalRef = globalThis as unknown as GlobalWithEncoder;

if (typeof globalRef.TextEncoder === 'undefined') {
  class TextEncoderPolyfill {
    readonly encoding = 'utf-8';

    /** Encode a string to its UTF-8 bytes (astral chars via surrogate pairs). */
    encode(input = ''): Uint8Array {
      const bytes: number[] = [];
      for (let i = 0; i < input.length; i += 1) {
        let code = input.charCodeAt(i);
        // Combine a high+low surrogate pair into a single code point.
        if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
          const low = input.charCodeAt(i + 1);
          if (low >= 0xdc00 && low <= 0xdfff) {
            code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
            i += 1;
          }
        }
        if (code < 0x80) {
          bytes.push(code);
        } else if (code < 0x800) {
          bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        } else if (code < 0x10000) {
          bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        } else {
          bytes.push(
            0xf0 | (code >> 18),
            0x80 | ((code >> 12) & 0x3f),
            0x80 | ((code >> 6) & 0x3f),
            0x80 | (code & 0x3f),
          );
        }
      }
      return Uint8Array.from(bytes);
    }
  }

  globalRef.TextEncoder = TextEncoderPolyfill;
}
