# Zelo Seller Dashboard

React (Vite) web app for restaurant/store/farmer accounts: order inbox, catalog management,
and earnings/withdrawals.

## Setup

```bash
npm install
cp .env.example .env   # point VITE_API_URL at your backend
npm run dev
```

Log in with any account registered with `role: seller` (via the mobile app's register screen,
or directly through the API) — note the account needs `verification_status: approved` (set by
an admin) before orders will actually route to it.

## Build for production

```bash
npm run build
```

Outputs to `dist/` — deploy as a static site alongside the admin dashboard.
