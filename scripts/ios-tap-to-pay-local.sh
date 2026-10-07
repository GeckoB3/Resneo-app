#!/usr/bin/env bash
# Local, Development-signed iOS build, made in Xcode on the Mac.
#
# Before 1.2.0 this was the only build that could carry the Tap to Pay on iPhone
# entitlement (Apple's grant was development-only; EAS signs Ad Hoc). The
# distribution grant came on 2026-10-01 and the entitlement is now in app.json
# for every build, so this is a quick local Release build for re-recording
# Apple's videos or debugging on a device. See Docs/TAP_TO_PAY.md.
#
#   scripts/ios-tap-to-pay-local.sh [device name or UDID]
#
# Builds the Release configuration (bundled JS, no dev menu, runs without the
# Mac) against .env.development.local, and installs it on the connected iPhone.
set -euo pipefail
cd "$(dirname "$0")/.."

# Release bundling runs with NODE_ENV=production, which does not read
# .env.development.local by itself, so export it into the build's environment.
if [ -f .env.development.local ]; then
  set -a
  . ./.env.development.local
  set +a
fi

# Signing team for the local build (app.config.js). Jar 26 Ltd.
export APPLE_TEAM_ID="${APPLE_TEAM_ID:-4V8S56N4XX}"
# Expo's precompiled modules are built with Swift 6.3 (Xcode 26.4+), which an
# Intel Mac capped at macOS 15 cannot run. Build them from source instead.
export EXPO_USE_PRECOMPILED_MODULES=0
export SENTRY_DISABLE_AUTO_UPLOAD=true

# --no-clean: Expo 57's prebuild otherwise deletes ios/ (and the build cache in
# ios/build with it) on every run. package.json is put back afterwards because
# prebuild rewrites the `ios`/`android` scripts to `expo run:*`.
package_json_backup="$(mktemp)"
cp package.json "$package_json_backup"
CI=1 npx expo prebuild --platform ios --no-clean
cp "$package_json_backup" package.json
rm -f "$package_json_backup"

# Always, not only when prebuild decides to: it re-runs `pod install` only when
# package.json dependencies change, so a new local module (modules/) or a change
# to the environment above would otherwise never reach the native project.
pod install --project-directory=ios

# Built with xcodebuild directly rather than `expo run:ios`: once a team is set,
# Expo leaves out -allowProvisioningUpdates, so Xcode may not create or refresh
# the Development profile that carries the entitlement.
xcodebuild \
  -workspace ios/Resneo.xcworkspace \
  -scheme Resneo \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath ios/build \
  -allowProvisioningUpdates \
  COCOAPODS_PARALLEL_CODE_SIGN=true \
  COMPILER_INDEX_STORE_ENABLE=NO \
  build | npx excpretty

exec npx expo run:ios --binary ios/build/Build/Products/Release-iphoneos/Resneo.app ${1:+--device "$1"}
