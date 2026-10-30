import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// IMPORTANT: this module is imported while Next.js builds the app ("Collecting page
// data"). Throwing here when DATABASE_URL is missing makes the whole deploy fail, so we
// never throw at import time. Without a DATABASE_URL, queries fail at call time instead
// (the API routes and /api/health already handle that), and the app still builds.
const databaseUrl =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/app_db";

if (!process.env.DATABASE_URL) {
  console.warn("[db] DATABASE_URL is not set — database queries will fail until it is configured.");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    // Serverless-friendly: few connections, fail fast instead of hanging a request.
    max: 3,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 10000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
