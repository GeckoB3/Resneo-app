# Resneo Mobile App

Staff mobile app for [Resneo](https://github.com/GeckoB3/reserve-ni) — appointments calendar, bookings, and client lookup for Northern Ireland salons and clinics. (The web backend repo is still named `reserve-ni`.)

Built with **Expo SDK 56**, **Expo Router**, **Supabase**, and **TanStack Query**.

## Prerequisites

- Node.js 20+
- [Expo Go](https://expo.dev/go) on your phone, or Android Studio / Xcode for simulators
- A running [reserve-ni](https://github.com/GeckoB3/reserve-ni) web backend (local or deployed)

## Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your Supabase URL, anon key, and API URL

# Start the dev server
npm start
```

Press `i` for iOS simulator, `a` for Android, or scan the QR code with Expo Go.

## Environment variables

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL (same as web app) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable key |
| `EXPO_PUBLIC_API_URL` | reserve-ni web app URL (e.g. `http://localhost:3000`) |

## Project structure

```
app/           Expo Router screens
components/ui/ Reusable UI primitives
lib/           Supabase, API client, query hooks
theme/         Colours, spacing, typography
types/         Shared TypeScript types
_reference/    Local read-only clone of reserve-ni (gitignored)
```

See [Docs/RESNEO_REDESIGN_PLAN.md](Docs/RESNEO_REDESIGN_PLAN.md) for the current (appointments-first redesign) plan. The older [Docs/MOBILE_BUILD_PLAN.md](Docs/MOBILE_BUILD_PLAN.md) is retained for historical context.

For testing against a deployed backend (Vercel staging), see [Docs/STAGING_SETUP.md](Docs/STAGING_SETUP.md).

## Reference web app

Clone the web codebase locally for API and type reference:

```bash
mkdir _reference
cd _reference
git clone https://github.com/GeckoB3/reserve-ni.git
```

The `_reference/` folder is gitignored.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo dev server |
| `npm run android` | Open on Android |
| `npm run ios` | Open on iOS |
| `npm run web` | Open in browser |

## Build (EAS)

Requires [EAS CLI](https://docs.expo.dev/build/setup/) and an Expo account:

```bash
npx eas-cli build --profile development
npx eas-cli build --profile preview
```

Profiles are defined in `eas.json`.
