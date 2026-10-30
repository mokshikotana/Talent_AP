# ReturnGuard AI audit report

Audit scope: static review of the supplied ZIP source and deployment files, plus environment checks on 2026-10-31. The archive was extracted and inspected. Node v24.22.1 is present, but npm is unavailable in this environment; dependencies were not installed. Therefore no build, lint, typecheck, or automated test execution is claimed. No live database, Gemini key, deployed site, or browser session was available.

## A. Overall status

The codebase is a Next.js App Router application with PostgreSQL/Drizzle and a TypeScript ML pipeline. It is not verified as production-ready. Deployment requires database setup and the generated model artifact. The source advertises synthetic demo data and a provisional evaluation contract; these are not official performance claims.

## B. Bugs and risks found

| ID | Area | Severity | Finding | Status |
|---|---|---:|---|---|
| RG-01 | Deployment reproducibility | P1 | No package lockfile is included, so dependency resolution can vary between installs. | Documented; generate and commit a lockfile with npm. |
| RG-02 | Serverless rate limiting | P1 | Rate and AI budget counters use `globalThis` process memory; Vercel instances/cold starts do not share them, so configured limits are not global. | Documented; needs shared storage implementation and provider choice. |
| RG-03 | API access control | P1 | Review and message approval routes expose data-changing actions without authenticated identity; the reviewer is free text. | Unresolved; requires product identity/role policy. |
| RG-04 | Database bootstrap | P1 | `src/db/index.ts` throws during import when `DATABASE_URL` is unset; database schema and demo records require manual bootstrap. | Deployment steps documented; needs configured hosted DB and initialization. |
| RG-05 | Verification coverage | P1 | Build, lint, typecheck, tests, browser flows, and live integrations could not be executed because npm/dependencies and services were unavailable. | Unverified. |
| RG-06 | Artifact deployment | P2 | Health and inference depend on `artifacts/model.json`; a missing artifact prevents the trained-model workflow. | Deployment inclusion requirement documented. |

## C. Changes made

Added `DEPLOYMENT.md` with Vercel environment, database bootstrap, model artifact, and production hardening steps. Added this report to distinguish source inspection from tests that were not run. No application behavior was changed because runtime verification and a safe regression check were unavailable.

## D. Security findings

The project includes CSP/security headers, server-side API key access, validation helpers, and parameterized Drizzle usage. Static review identified unauthenticated write operations and per-process rate limits as material production risks. No penetration test was performed. Do not treat the project as safe for customer data until access control and shared limits are implemented.

## E. Backend and integration

PostgreSQL is required by the current DB module. Gemini is optional according to the project configuration. Neither integration was exercised. Schema push and model seeding are documented as manual setup steps; no checked-in migration set was found in the archive.

## F. Performance

No runtime measurements were taken. Not assessed.

## G. Responsive design and accessibility

Source includes responsive UI styling, but no browser/device or accessibility audit was run. Not verified.

## H. Automated test results

Tests present: `tests/returnguard.test.ts` (identified from source archive). Executed: 0. Passed/failed/skipped: not assessed. Reason: npm unavailable and dependencies not installed. Build, lint, typecheck, and end-to-end workflows likewise not run.

## I. Remaining blockers

Provide a working Node/npm environment to install dependencies and execute the project checks. Configure a hosted PostgreSQL database and initialize its schema/model. Authentication and distributed rate limiting require implementation decisions and external infrastructure. Gemini behavior requires a valid key for live verification.

## J. Readiness scores

Scores are not assessed because runtime and integration evidence is insufficient. This applies to functionality, backend reliability, security, performance, responsive design, accessibility, AI reliability, automated coverage, and overall readiness.

