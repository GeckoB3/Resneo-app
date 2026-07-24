// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// react-native-svg ships platform-specific web files (.web.js) but some of its
// internal modules (e.g. ./xml) only have a plain .js version. When Metro is
// resolving from within a .web.js file it tries the web platform variant first
// and fails to fall back. We patch the resolver so that unresolvable requests
// from inside react-native-svg's lib/module are retried without the platform
// suffix — effectively implementing the standard JS module fallback.
const originalResolveRequest = config.resolver?.resolveRequest;

config.resolver = config.resolver ?? {};

// The Stripe Terminal SDK (in-person payments) is NATIVE ONLY, and its web
// build is broken upstream: `lib/commonjs/logger/index.js` requires
// "../../package.json", which resolves to a `lib/package.json` the package does
// not ship, so `expo export --platform web` fails to bundle. (Native builds are
// unaffected — the package's `react-native` field points at `src/`, where the
// same relative path correctly resolves to the package root.)
//
// Stubbing it on web is the honest fix rather than a workaround: Tap to Pay and
// Bluetooth readers cannot work in a browser at all. `lib/payments/terminal-sdk.ts`
// treats a module without `useStripeTerminal` as "unavailable" and the whole
// payment surface simply does not render, exactly as on a native build that
// predates the dependency.
const NATIVE_ONLY_WEB_STUBS = ['@stripe/stripe-terminal-react-native'];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && NATIVE_ONLY_WEB_STUBS.some((m) => moduleName === m || moduleName.startsWith(`${m}/`))) {
    return { type: 'empty' };
  }
  if (originalResolveRequest) {
    try {
      return originalResolveRequest(context, moduleName, platform);
    } catch {
      // fall through to default resolution below
    }
  }
  // Default Metro resolution
  try {
    return context.resolveRequest(context, moduleName, platform);
  } catch (err) {
    // If resolution fails for a relative path inside react-native-svg's web
    // module, retry with 'native' platform so it picks up the plain .js file.
    if (
      platform === 'web' &&
      moduleName.startsWith('.') &&
      context.originModulePath?.includes('react-native-svg')
    ) {
      return context.resolveRequest(context, moduleName, 'native');
    }
    throw err;
  }
};

// Keep co-located test files (e.g. app/**/X.test.tsx) OUT of the native bundle.
// Expo Router's require.context scans the whole app/ dir, so without this it
// bundles test files — pulling in @testing-library/react-native, which imports
// the Node "console" module and breaks the native bundle. Jest is unaffected
// (it doesn't use Metro). Merge with any existing default blockList.
const testFileBlockList = [/.*\.(test|spec)\.[jt]sx?$/, /[\\/]__tests__[\\/].*/];
config.resolver.blockList =
  config.resolver.blockList == null
    ? testFileBlockList
    : [].concat(config.resolver.blockList, testFileBlockList);

module.exports = config;
