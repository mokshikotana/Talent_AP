# Vercel deployment notes

## Required services and variables

This app imports the PostgreSQL connection during server module initialization. Configure `DATABASE_URL` in Vercel for Production, Preview, and Development before deployment. Use a hosted PostgreSQL provider reachable from Vercel and its pooled connection string where available. `GEMINI_API_KEY` is optional; without it, the application uses its built-in policy-safe response writer. Set it only as a server-side Vercel Environment Variable (never with a `NEXT_PUBLIC_` prefix).

## Initialize the database and demo model

The repository currently has no checked-in migration files or package lockfile. From a trusted local Node/npm environment, install dependencies, configure `DATABASE_URL`, then run:

```bash
npm install
npx drizzle-kit push
npx tsx scripts/seed-and-train.ts
npm run build
```

The seed/training command writes `artifacts/model.json` and persists seed data and metrics to PostgreSQL. Include the resulting model artifact when pushing the project to GitHub so Vercel can bundle it. Do not run the seed command on every deployment; it is an initialization step. Review the provider's backup and connection-pooling guidance before using production data.

## Before exposing the app to real users

- Add authentication and authorization to data-changing endpoints. The current review actions accept a free-text reviewer name and are not identity verification.
- Move IP limits and AI usage caps to shared persistent storage. The current counters live in process memory and do not provide reliable global limits across serverless instances or cold starts.
- Configure a trusted proxy/IP strategy for Vercel and validate forwarding headers before relying on per-IP limits.
- Confirm database schema and seed data are initialized, then check `/api/health` after deployment.
- The supplied archive has no dependency lockfile. Generate and commit `package-lock.json` using the intended Node/npm versions before relying on reproducible builds.

