import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { artifactExists, loadArtifact } from "@/lib/ml/pipeline";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let dbOk = false;
  let counts: { cases: number; customers: number; products: number; reviewActions: number } | null = null;
  try {
    const [r] = (
      await db.execute(sql`
        SELECT
          (SELECT count(*) FROM return_cases)::int AS cases,
          (SELECT count(*) FROM customers)::int AS customers,
          (SELECT count(*) FROM products)::int AS products,
          (SELECT count(*) FROM review_actions)::int AS "reviewActions"
      `)
    ).rows as { cases: number; customers: number; products: number; reviewActions: number }[];
    dbOk = true;
    counts = { cases: r.cases, customers: r.customers, products: r.products, reviewActions: r.reviewActions };
  } catch {
    dbOk = false;
  }
  const art = artifactExists() ? loadArtifact()?.raw ?? null : null;
  return NextResponse.json({
    ok: dbOk,
    db: dbOk ? "up" : "down",
    latencyMs: Date.now() - started,
    model: art
      ? { loaded: true, version: art.version, dataSource: art.dataSource, trainedAt: art.trainedAt, provisionalEvaluation: art.provisionalEvaluation }
      : { loaded: false, reason: "artifacts/model.json not found — run `npx tsx scripts/seed-and-train.ts`" },
    data: counts,
    env: { databaseUrl: Boolean(process.env.DATABASE_URL) },
    time: new Date().toISOString(),
  });
}
