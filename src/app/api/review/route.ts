import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { reviewActions, returnCases } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const VALID_ACTIONS = [
  "approve",
  "override-auto-approve",
  "override-escalate",
  "pending",
  "evidence-request",
  "outcome",
] as const;

/** GET ?view=audit (trail) | ?view=runs (model runs) | default: review queue */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const view = url.searchParams.get("view") ?? "queue";
    if (view === "audit") {
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 60) || 60));
      const rows = (
        await db.execute(sql`
          SELECT id, case_id, action, actor, detail, model_version, original_routing, created_at
          FROM review_actions ORDER BY id DESC LIMIT ${limit}
        `)
      ).rows;
      return NextResponse.json({ rows });
    }
    if (view === "runs") {
      const rows = (
        await db.execute(sql`
          SELECT id, version, kind, data_source, metrics, created_at
          FROM model_runs ORDER BY id DESC LIMIT 20
        `)
      ).rows;
      return NextResponse.json({ rows });
    }
    const routing = url.searchParams.get("routing");
    const status = url.searchParams.get("status") ?? "open";
    const limit = Math.min(60, Math.max(1, Number(url.searchParams.get("limit") ?? 25) || 25));
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
    const conds = [sql`rc.review_status = ${status}`, sql`rc.routing <> 'AUTO-APPROVE'`];
    if (routing) conds.push(sql`rc.routing = ${routing}`);
    const where = sql.join(conds, sql` AND `);
    const rows = (
      await db.execute(sql`
        SELECT rc.id, rc.order_value, rc.days_since_delivery, rc.region, rc.sku_category,
               rc.reason_text, rc.detected_language, rc.label, rc.source,
               rc.probs, rc.predicted_class, rc.routing, rc.expected_cost,
               rc.calibrated_confidence, rc.model_version, rc.review_status, rc.created_at,
               rc.customer_tenure_days, rc.prior_orders_12m, rc.prior_returns_12m, rc.history_missing,
               p.name AS product_name
        FROM return_cases rc LEFT JOIN products p ON p.id = rc.product_id
        WHERE ${where}
        ORDER BY CASE rc.routing WHEN 'ESCALATE' THEN 0 ELSE 1 END, rc.expected_cost DESC
        LIMIT ${limit} OFFSET ${offset}
      `)
    ).rows;
    const [c] = (
      await db.execute(sql`SELECT count(*)::int AS c FROM return_cases rc WHERE ${where}`)
    ).rows as { c: number }[];
    return NextResponse.json({ rows, total: c });
  } catch (e) {
    return NextResponse.json(
      { error: "review_failed", message: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}

/**
 * Human review action. The model's original prediction/routing is NEVER
 * overwritten — human decisions are stored as separate audit records and the
 * case's review_status is updated.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      caseId?: string;
      action?: string;
      detail?: string;
      actor?: string;
    };
    const caseId = (body.caseId ?? "").trim();
    const action = (body.action ?? "").trim() as (typeof VALID_ACTIONS)[number];
    const actor = (body.actor ?? "demo-reviewer").trim().slice(0, 64) || "demo-reviewer";
    const detail = (body.detail ?? "").trim().slice(0, 800);
    if (!caseId) return NextResponse.json({ error: "missing_case_id" }, { status: 422 });
    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: "invalid_action", valid: VALID_ACTIONS }, { status: 422 });
    }
    if ((action === "override-auto-approve" || action === "override-escalate" || action === "outcome") && detail.length < 3) {
      return NextResponse.json(
        { error: "reason_required", message: "Overrides and outcomes must record a reason." },
        { status: 422 },
      );
    }
    const [found] = await db
      .select({ id: returnCases.id, routing: returnCases.routing, modelVersion: returnCases.modelVersion })
      .from(returnCases)
      .where(eq(returnCases.id, caseId))
      .limit(1);
    if (!found) return NextResponse.json({ error: "case_not_found" }, { status: 404 });

    const [inserted] = await db
      .insert(reviewActions)
      .values({
        caseId,
        action,
        actor,
        detail,
        modelVersion: found.modelVersion,
        originalRouting: found.routing,
      })
      .returning();

    const newStatus =
      action === "pending" || action === "evidence-request" ? "pending" : "decided";
    await db.execute(sql`UPDATE return_cases SET review_status = ${newStatus} WHERE id = ${caseId}`);

    return NextResponse.json({ ok: true, action: inserted, reviewStatus: newStatus });
  } catch (e) {
    return NextResponse.json(
      { error: "review_action_failed", message: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
