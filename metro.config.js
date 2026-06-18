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
config.resolver.resolveRequest = (context, moduleName, platform) => {
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
