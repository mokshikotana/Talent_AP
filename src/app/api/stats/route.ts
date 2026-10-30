import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { loadArtifact } from "@/lib/ml/pipeline";

export const dynamic = "force-dynamic";

/**
 * Command Center aggregates — everything computed from persisted predictions
 * over the (clearly labeled) synthetic demo dataset, plus model-run metrics
 * from the training artifact. No invented numbers.
 */
export async function GET(req: Request) {
  try {
    const mode = new URL(req.url).searchParams.get("mode") === "real" ? "real" : "demo";
    const sourceFilter = mode === "real" ? sql`source <> 'synthetic-demo'` : sql`source = 'synthetic-demo'`;
    const [agg] = (
      await db.execute(sql`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE routing = 'AUTO-APPROVE')::int AS auto_approve,
          count(*) FILTER (WHERE routing = 'INSPECT')::int AS inspect,
          count(*) FILTER (WHERE routing = 'ESCALATE')::int AS escalate,
          coalesce(avg(expected_cost), 0)::float AS avg_expected_cost,
          count(*) FILTER (WHERE label IS NOT NULL AND predicted_class = 'abusive' AND label <> 'abusive')::int AS false_positives,
          count(*) FILTER (WHERE label IS NOT NULL AND predicted_class <> 'abusive' AND label = 'abusive')::int AS false_negatives,
          count(*) FILTER (WHERE source = 'upload')::int AS uploads,
          count(*) FILTER (WHERE source = 'live')::int AS live
        FROM return_cases
        WHERE ${sourceFilter}
      `)
    ).rows as {
      total: number; auto_approve: number; inspect: number; escalate: number;
      avg_expected_cost: number; false_positives: number; false_negatives: number;
      uploads: number; live: number;
    }[];

    const [queue] = (
      await db.execute(sql`
        SELECT
          count(*) FILTER (WHERE review_status = 'open' AND routing <> 'AUTO-APPROVE')::int AS open_queue,
          count(*) FILTER (WHERE review_status = 'pending')::int AS pending,
          count(*) FILTER (WHERE review_status = 'decided')::int AS decided
        FROM return_cases
        WHERE ${sourceFilter}
      `)
    ).rows as { open_queue: number; pending: number; decided: number }[];

    const monthly = (
      await db.execute(sql`
        SELECT month_index AS m, count(*)::int AS c
        FROM return_cases WHERE ${sourceFilter} GROUP BY month_index ORDER BY month_index
      `)
    ).rows as { m: number; c: number }[];

    const langRows = (
      await db.execute(sql`
        SELECT detected_language AS lang, count(*)::int AS c
        FROM return_cases WHERE ${sourceFilter} GROUP BY detected_language
      `)
    ).rows as { lang: string; c: number }[];

    const [fitAgg] =
      mode === "demo"
        ? ((await db.execute(sql`
        SELECT count(*)::int AS fit_cases,
               count(DISTINCT product_id)::int AS fit_products
        FROM return_cases WHERE label = 'genuine_fit_issue'
      `)).rows as { fit_cases: number; fit_products: number }[])
        : ((await db.execute(sql`
        SELECT count(*)::int AS fit_cases,
               count(DISTINCT product_id)::int AS fit_products
        FROM return_cases WHERE ${sourceFilter} AND predicted_class = 'genuine_fit_issue'
      `)).rows as { fit_cases: number; fit_products: number }[]);

    const art = loadArtifact()?.raw ?? null;
    const fused = art?.metrics?.fused ?? null;
    const fairnessFindings: string[] = [];
    if (art?.fairness) {
      for (const section of art.fairness) {
        for (const f of section.findings.slice(0, 1)) fairnessFindings.push(`${section.title}: ${f}`);
      }
    }

    return NextResponse.json({
      mode,
      dataSource: mode === "real" ? "your-data" : art?.dataSource ?? "unavailable",
      modelVersion: art?.version ?? null,
      provisionalEvaluation: art?.provisionalEvaluation ?? true,
      totals: {
        analyzed: agg.total,
        autoApprove: agg.auto_approve,
        inspect: agg.inspect,
        escalate: agg.escalate,
        avgExpectedCost: agg.avg_expected_cost,
        falsePositives: agg.false_positives,
        falseNegatives: agg.false_negatives,
        uploads: agg.uploads,
        live: agg.live,
      },
      queue,
      monthly: monthly.map((r) => r.c),
      languages: Object.fromEntries(langRows.map((r) => [r.lang, r.c])),
      model: fused
        ? {
            meanCost: fused.meanCost,
            accuracy: fused.accuracy,
            macroF1: fused.macroF1,
            balancedAccuracy: fused.balancedAccuracy,
            brier: fused.brier,
            reviewWorkloadPct: fused.routing?.reviewWorkloadPct ?? null,
          }
        : null,
      baselines: art?.baselines
        ? Object.fromEntries(Object.entries(art.baselines).map(([k, v]) => [k, v.meanCost]))
        : null,
      fairnessFindings,
      fit: fitAgg,
      splitNote: art?.splitStrategy ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "stats_failed", message: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
