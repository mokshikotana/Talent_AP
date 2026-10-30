import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Case listing with filters for the workbench / dataset preview.
 * Query: routing, source, split, language, search (reason text / id), limit, offset,
 * sort (expected_cost|order_value|days_since_delivery), dir (asc|desc).
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const routing = url.searchParams.get("routing");
    const source = url.searchParams.get("source");
    const split = url.searchParams.get("split");
    const language = url.searchParams.get("language");
    const reviewStatus = url.searchParams.get("reviewStatus");
    const search = (url.searchParams.get("search") ?? "").slice(0, 80);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 25) || 25));
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
    // Hard map: user input can only ever select a pre-written SQL fragment,
    // so no caller-controlled string ever reaches the query (no sql.raw).
    const SORTS = {
      expected_cost: sql`rc.expected_cost`,
      order_value: sql`rc.order_value`,
      days_since_delivery: sql`rc.days_since_delivery`,
      calibrated_confidence: sql`rc.calibrated_confidence`,
    } as const;
    const sortKey = (url.searchParams.get("sort") ?? "") as keyof typeof SORTS;
    const sortExpr = SORTS[sortKey] ?? SORTS.expected_cost;
    const dir = url.searchParams.get("dir") === "asc" ? sql`ASC` : sql`DESC`;

    const conds = [sql`TRUE`];
    if (routing) conds.push(sql`rc.routing = ${routing}`);
    if (source) conds.push(sql`rc.source = ${source}`);
    if (split) conds.push(sql`rc.split = ${split}`);
    if (language) conds.push(sql`rc.detected_language = ${language}`);
    if (reviewStatus) conds.push(sql`rc.review_status = ${reviewStatus}`);
    if (search) conds.push(sql`(rc.id ILIKE ${"%" + search + "%"} OR rc.reason_text ILIKE ${"%" + search + "%"})`);
    const where = sql.join(conds, sql` AND `);

    const rows = (
      await db.execute(sql`
        SELECT rc.id, rc.order_value, rc.quantity, rc.discount_pct, rc.delivery_days,
               rc.days_since_delivery, rc.payment_method, rc.region, rc.sku_category,
               rc.customer_tenure_days, rc.prior_orders_12m, rc.prior_returns_12m,
               rc.account_orders_lifetime, rc.history_missing, rc.reason_text,
               rc.detected_language, rc.label, rc.source, rc.split,
               rc.probs, rc.predicted_class, rc.routing, rc.expected_cost,
               rc.calibrated_confidence, rc.model_version, rc.review_status,
               p.name AS product_name
        FROM return_cases rc
        LEFT JOIN products p ON p.id = rc.product_id
        WHERE ${where}
        ORDER BY ${sortExpr} ${dir} NULLS LAST, rc.id
        LIMIT ${limit} OFFSET ${offset}
      `)
    ).rows;

    const [countRow] = (
      await db.execute(sql`SELECT count(*)::int AS c FROM return_cases rc WHERE ${where}`)
    ).rows as { c: number }[];

    return NextResponse.json({ rows, total: countRow.c, limit, offset });
  } catch (e) {
    return NextResponse.json(
      { error: "cases_failed", message: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
