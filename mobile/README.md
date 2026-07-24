# Zelo Mobile

Single Expo (React Native) app serving both the **Customer** and **Driver** roles — the app
routes to the right set of screens automatically based on the logged-in user's role.

## Setup

```bash
npm install
```

Edit `src/api/client.js` and set `API_BASE` to your backend's address:
- iOS simulator: `http://localhost:5000/api/v1` works as-is
- Android emulator: use `http://10.0.2.2:5000/api/v1`
- Physical device: use your computer's LAN IP, e.g. `http://192.168.1.20:5000/api/v1`

## Run

```bash
npx expo start
```

Scan the QR code with Expo Go (iOS/Android), or press `i` / `a` for a simulator/emulator.

You can also run it in a browser for quick iteration: `npx expo start --web` (uses react-native-web —
useful for development, not a substitute for testing on a real device before shipping).

## What's implemented

**Customer:** browse nearby sellers, view a storefront's menu, build a cart, set a real delivery
location via device GPS (with reverse geocoding on iOS/Android, manual address text on web),
place an order (with the extended-distance confirmation flow), and track delivery progress live.

**Driver:** go online/offline using a real GPS fix, background location refresh every 20s while
online, see nearby delivery requests filtered by vehicle type, accept/reject, and progress a
delivery through pickup → drop-off, which triggers the autonomous escrow payout on the backend
the moment "delivered" is marked.

## What's stubbed (needs real device/production work)

- Reverse geocoding (turning coordinates into a street address) isn't available on Expo web —
  on web the app falls back to raw coordinates with an editable text field; this works fully on
  iOS/Android where `expo-location`'s native geocoding is available.
- Push notifications for new order alerts (seller) and delivery requests (driver) aren't wired
  up yet — recommend `expo-notifications` + a device token stored against the user record.
- Payment is a placeholder `processor_ref` — needs a real Stripe SDK integration
  before real money moves.
- Background location tracking only runs while the app is in the foreground — for production,
  add `expo-location`'s background location task so a driver's position keeps updating if they
  switch apps mid-delivery.
