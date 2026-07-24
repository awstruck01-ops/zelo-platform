# Zelo — Full Platform

Everything for Zelo in one place:

```
zelo-platform/
├── backend/       Node.js/Express/PostgreSQL API — the core that everything else talks to
├── admin-web/     React web dashboard for internal staff (live map, transactions, verifications)
├── seller-web/    React web dashboard for restaurants/stores/farmers (orders, catalog, earnings)
└── mobile/        Expo (React Native) app — customer + driver, in one codebase
```

**Start order matters: backend first, then whichever frontend(s) you need.** The three
frontends are just clients of the backend's API — none of them will do anything useful until
the backend is running and reachable.

Everything below has been tested end-to-end (registration through order completion through
payout) against a live Postgres + Redis instance, so following these steps should get you a
fully working local system.

---

## 0. Prerequisites

Install these once, if you don't already have them:

- **Node.js 18+** and npm — https://nodejs.org
- **PostgreSQL** (v14+) — https://www.postgresql.org/download/
- **Redis** — https://redis.io/docs/getting-started/installation/
- **Git** (to version control this once you start editing it)
- For the mobile app: the **Expo Go** app on your phone (iOS App Store / Google Play), or
  Xcode (iOS simulator, Mac only) / Android Studio (Android emulator)

---

## 1. Backend setup (do this first)

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and fill in:
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` — your local Postgres credentials
  (or set `DATABASE_URL` instead if you're pointing at a hosted Postgres)
- `REDIS_HOST`, `REDIS_PORT` — your local Redis (or `REDIS_URL` for a hosted one)
- `JWT_SECRET` and `JWT_REFRESH_SECRET` — generate real random values:
  ```bash
  openssl rand -hex 32
  ```
  Run that twice and paste one result into each variable. Don't ship the placeholder values.

Create the database (if it doesn't exist yet):
```bash
createdb zelo
```

Start it:
```bash
npm start
```

You should see:
```
✅ Redis connected
✅ Database initialized successfully
🚀 Zelo API running on port 5000
```

The first boot automatically creates every table. Confirm it's alive:
```bash
curl http://localhost:5000/health
```
Should return `{"status":"ok", ...}`.

**Keep this running in its own terminal** — everything else in this guide depends on it.

---

## 2. Create your first admin user

There's no public admin signup (intentionally — you don't want strangers granting themselves
admin access). Create one manually:

1. Register a normal account through the API directly:
   ```bash
   curl -X POST http://localhost:5000/api/v1/auth/send-otp \
     -H "Content-Type: application/json" \
     -d '{"phone":"08000000001"}'
   ```
   Check your backend terminal output for a line like `📱 OTP for 08000000001: 123456` — copy that code.

2. Register with it:
   ```bash
   curl -X POST http://localhost:5000/api/v1/auth/register \
     -H "Content-Type: application/json" \
     -d '{"phone":"08000000001","otp":"123456","password":"yourpassword","role":"customer","date_of_birth":"1990-01-01"}'
   ```
   Copy the `id` field from the response.

3. Promote that user to admin directly in the database:
   ```bash
   psql -d zelo -c "UPDATE users SET role='admin' WHERE id='PASTE-THE-ID-HERE';"
   ```

You can now log into the admin dashboard with phone `08000000001` and the password you set.

---

## 3. Admin web dashboard

```bash
cd admin-web
npm install
cp .env.example .env
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`) and log in with the admin account
from step 2. You'll see live driver/order monitoring, the transaction ledger, and seller/driver
verification screens.

**Production build:** `npm run build` outputs static files to `dist/` — deploy that to any
static host (Vercel, Netlify, S3+CloudFront, etc.) and set `VITE_API_URL` in `.env` to your
deployed backend's URL before building.

---

## 4. Seller web dashboard

```bash
cd seller-web
npm install
cp .env.example .env
npm run dev
```

A seller account needs to exist and be **approved** before this dashboard is useful:
1. Register a seller account (role: `seller`) through the mobile app's registration screen,
   or directly via the API (see the backend's `auth.routes.js` for the required fields —
   `business_name`, `category`, `address`, `lat`, `lng` are needed in addition to the usual
   phone/password/OTP).
2. Log into the **admin dashboard** (step 3) → Verifications → Approve that seller.
3. Now log into the seller dashboard with that account.

Same production build process as admin-web.

---

## 5. Mobile app (customer + driver)

```bash
cd mobile
npm install
```

Open `src/api/client.js` and set `API_BASE` to point at your backend:
- **iOS simulator:** `http://localhost:5000/api/v1` works as-is
- **Android emulator:** use `http://10.0.2.2:5000/api/v1` (emulator's alias for your host machine)
- **Physical phone via Expo Go:** use your computer's LAN IP, e.g. `http://192.168.1.42:5000/api/v1`
  — find it with `ipconfig getifaddr en0` (Mac) or `ipconfig` (Windows). Your phone and computer
  need to be on the same Wi-Fi network.

Start it:
```bash
npx expo start
```

- Scan the QR code with the **Expo Go** app on your phone, or
- Press `i` for iOS simulator, `a` for Android emulator, or
- Press `w` to run it in a browser (fine for quick iteration; GPS/reverse-geocoding is more
  limited there — test on a real device before shipping)

**Register a driver or customer account directly from the app's "Create an account" screen.**
Driver accounts also need admin approval (same Verifications screen in admin-web) before they
can go online and receive delivery requests.

---

## 6. Trying the full flow together

With all four pieces running, a realistic end-to-end test looks like:

1. **Admin dashboard:** approve a seller and a driver (Verifications tab)
2. **Seller dashboard:** log in as that seller, add a menu item (Catalog tab)
3. **Mobile app:** register/log in as a customer, browse to that seller, add the item, set your
   delivery address, place the order
4. **Seller dashboard:** accept the order, mark it ready
5. **Mobile app:** log in as the driver (or use a second device/simulator), go online, accept
   the delivery request, walk it through pickup → delivered
6. **Admin dashboard:** watch the order complete and the revenue numbers update in Overview

---

## Before this goes anywhere near real users

These are flagged throughout the code with `TODO` comments — don't skip them:

- **Payments:** order creation currently trusts a client-supplied `processor_ref` instead of
  verifying a real Stripe webhook. This is the single most important gap to close
  before real money is involved.
- **Bank transfers:** withdrawals are recorded but don't yet call a real payout API.
- **Push notifications:** not wired up (new order alerts, delivery requests).
- **Background location:** the driver's GPS only updates while the app is in the foreground.

Ask for help closing any of these — the backend's route files already have comments marking
exactly where each integration point goes.
