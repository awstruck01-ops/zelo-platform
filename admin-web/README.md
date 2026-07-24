# Zelo Admin Ops Dashboard

React (Vite) web app for internal staff: live driver/order monitoring, transaction ledger,
seller/driver verification, and dispute resolution.

## Setup

```bash
npm install
cp .env.example .env   # point VITE_API_URL at your backend
npm run dev
```

Log in with an account whose `role` is `admin` in the `users` table (promote a user manually
via SQL — there's no self-serve admin signup, by design).

## Build for production

```bash
npm run build
```

Outputs to `dist/` — deploy as a static site (Vercel, Netlify, S3+CloudFront, or served
directly from the same host as your backend behind a reverse proxy).
