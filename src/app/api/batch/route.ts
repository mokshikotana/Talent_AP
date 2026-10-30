import { NextResponse } from "next/server";
import { db } from "@/db";
import { returnCases } from "@/db/schema";
import { parseCsv, toCsv } from "@/lib/ml/csv";
import { detectLanguage } from "@/lib/ml/text";
import { predictCase } from "@/lib/ml/pipeline";
import { validateCase } from "@/lib/api/validate";
import { rateLimit, clientIp } from "@/lib/rate";
import { CLASSES } from "@/lib/ml/labels";

export const dynamic = "force-dynamic";

const MAX_ROWS = 1500;
const MAX_BYTES = 2 * 1024 * 1024;

const HEADER_ALIASES: Record<string, string> = {
  order_value: "orderValue",
  ordervalue: "orderValue",
  order_id: "orderId",
  customer_id: "customerId",
  product_id: "productId",
  quantity: "quantity",
  discount_pct: "discountPct",
  discountpct: "discountPct",
  delivery_days: "deliveryDays",
  days_since_delivery: "daysSinceDelivery",
  payment_method: "paymentMethod",
  category: "category",
  sku_category: "category",
  region: "region",
  customer_tenure_days: "customerTenureDays",
  tenure_days: "customerTenureDays",
  prior_orders_12m: "priorOrders12m",
  prior_returns_12m: "priorReturns12m",
  account_orders_lifetime: "accountOrdersLifetime",
  reason_text: "reasonText",
  customer_reason: "reasonText",
  reason: "reasonText",
};

/**
 * CSV batch scoring. Original rows are preserved verbatim; invalid rows are
 * rejected with explicit reasons and never silently discarded.
 * Body: { csv: string }  →  { summary, rejected, results, resultsCsv }
 */
export async function POST(req: Request) {
  const rl = rateLimit(`batch:${clientIp(req)}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", message: "Batch limit reached — wait a minute and retry." }, { status: 429 });
  }
  try {
    const body = (await req.json()) as { csv?: string };
    const csvText = body?.csv ?? "";
    if (!csvText.trim()) {
      return NextResponse.json({ error: "empty_payload", message: "No CSV content provided." }, { status: 422 });
    }
    if (Buffer.byteLength(csvText, "utf8") > MAX_BYTES) {
      return NextResponse.json({ error: "too_large", message: "CSV exceeds the 2 MB safety cap. Split the file and retry." }, { status: 413 });
    }
    const parsed = parseCsv(csvText);
    if (parsed.errors.length) {
      // Non-fatal syntax warnings are reported but parsing continues.
      console.warn("csv warnings:", parsed.errors);
    }
    const canonical = parsed.headers.map((h) => HEADER_ALIASES[h] ?? h);
    if (!canonical.includes("orderValue")) {
      return NextResponse.json(
        {
          error: "missing_required_columns",
          message: "Header must include order_value (plus any of: quantity, discount_pct, delivery_days, days_since_delivery, payment_method, category, region, customer_tenure_days, prior_orders_12m, prior_returns_12m, reason_text).",
          receivedHeaders: parsed.headers,
        },
        { status: 422 },
      );
    }
    if (parsed.rows.length > MAX_ROWS) {
      return NextResponse.json({ error: "too_many_rows", message: `Row cap is ${MAX_ROWS} per batch.` }, { status: 413 });
    }

    const rejected: { row: number; errors: string[]; original: Record<string, string> }[] = [];
    const results: {
      caseId: string;
      row: number;
      predictedClass: string;
      routing: string;
      confidence: number;
      expectedCost: number;
      probs: Record<string, number>;
      language: string;
    }[] = [];

    const toInsert = [];
    for (let i = 0; i < parsed.rows.length; i++) {
      const rowArr = parsed.rows[i];
      const original: Record<string, string> = {};
      parsed.headers.forEach((h, j) => (original[h] = rowArr[j] ?? ""));
      const rec: Record<string, unknown> = {};
      canonical.forEach((c, j) => (rec[c] = rowArr[j]));
      const v = validateCase(rec);
      if (!v.ok) {
        rejected.push({ row: i + 2, errors: v.errors, original });
        continue;
      }
      const p = predictCase(v.input);
      const caseId = `UPL-${Date.now().toString(36)}-${(i + 1).toString().padStart(4, "0")}`;
      const language = detectLanguage(v.input.reasonText || "");
      results.push({
        caseId,
        row: i + 2,
        predictedClass: p.predictedClass,
        routing: p.routing,
        confidence: p.confidence,
        expectedCost: p.expectedCost,
        probs: p.probs,
        language,
      });
      toInsert.push({
        id: caseId,
        customerId: null,
        productId: null,
        skuCategory: v.input.category,
        orderValue: v.input.orderValue,
        quantity: v.input.quantity,
        discountPct: v.input.discountPct,
        deliveryDays: v.input.deliveryDays,
        daysSinceDelivery: v.input.daysSinceDelivery,
        paymentMethod: v.input.paymentMethod,
        region: v.input.region,
        customerTenureDays: v.input.customerTenureDays,
        priorOrders12m: v.input.priorOrders12m,
        priorReturns12m: v.input.priorReturns12m,
        accountOrdersLifetime: v.input.accountOrdersLifetime,
        historyMissing: v.input.customerTenureDays == null ? 1 : 0,
        reasonText: v.input.reasonText,
        detectedLanguage: language,
        label: null,
        source: "upload",
        split: "upload",
        monthIndex: 0,
        probs: p.probs,
        predictedClass: p.predictedClass,
        routing: p.routing,
        expectedCost: p.expectedCost,
        calibratedConfidence: p.confidence,
        modelVersion: p.modelVersion,
      });
    }
    if (toInsert.length) {
      for (let i = 0; i < toInsert.length; i += 400) {
        await db.insert(returnCases).values(toInsert.slice(i, i + 400));
      }
    }

    const outHeaders = [
      ...parsed.headers,
      "case_id", "predicted_class", "routing", "confidence", "expected_cost",
      "p_abusive", "p_quality", "p_fit", "p_wrong_item", "detected_language", "row_status",
    ];
    const resultByRow = new Map(results.map((r) => [r.row, r]));
    const rejectedByRow = new Map(rejected.map((r) => [r.row, r]));
    const outRows = parsed.rows.map((rowArr, i) => {
      const rowNo = i + 2;
      const r = resultByRow.get(rowNo);
      if (r) {
        return [
          ...rowArr, r.caseId, r.predictedClass, r.routing, r.confidence.toFixed(4),
          r.expectedCost.toFixed(4),
          ...CLASSES.map((c) => (r.probs[c] ?? 0).toFixed(4)),
          r.language, "accepted",
        ];
      }
      const rej = rejectedByRow.get(rowNo);
      return [...rowArr, "", "", "", "", "", "", "", "", "", "", `rejected: ${rej?.errors.join(" | ") ?? "unknown"}`];
    });
    const resultsCsv = toCsv(outHeaders, outRows);

    return NextResponse.json({
      summary: {
        received: parsed.rows.length,
        accepted: results.length,
        rejected: rejected.length,
        warnings: parsed.errors,
      },
      rejected,
      results: results.slice(0, 300), // UI preview; full data in resultsCsv
      resultsCsv,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "batch_failed", message: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
