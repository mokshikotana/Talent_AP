import { NextResponse } from "next/server";
import { db } from "@/db";
import { returnCases } from "@/db/schema";
import { detectLanguage } from "@/lib/ml/text";
import { predictCase } from "@/lib/ml/pipeline";
import { validateCase } from "@/lib/api/validate";
import { rateLimit, clientIp } from "@/lib/rate";

export const dynamic = "force-dynamic";

/**
 * Single-case analysis. Runs the full pipeline (structured + text + fusion,
 * calibrated probabilities, expected-cost routing, evidence-backed explanation).
 * Optional `persist: true` stores the case as source=live for the audit trail.
 */
export async function POST(req: Request) {
  const rl = rateLimit(`predict:${clientIp(req)}`, 60, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", message: "Too many scoring requests — slow down." }, { status: 429 });
  }
  try {
    const body = (await req.json()) as Record<string, unknown> & { persist?: boolean };
    const v = validateCase(body ?? {});
    if (!v.ok) {
      return NextResponse.json({ error: "validation_failed", errors: v.errors }, { status: 422 });
    }
    const prediction = predictCase(v.input);

    let caseId: string | null = null;
    if (body.persist === true) {
      caseId = `LIVE-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      await db.insert(returnCases).values({
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
        detectedLanguage: detectLanguage(v.input.reasonText || ""),
        label: null,
        source: "live",
        split: "live",
        monthIndex: 0,
        probs: prediction.probs,
        predictedClass: prediction.predictedClass,
        routing: prediction.routing,
        expectedCost: prediction.expectedCost,
        calibratedConfidence: prediction.confidence,
        modelVersion: prediction.modelVersion,
      });
    }

    return NextResponse.json({ ...prediction, caseId });
  } catch (e) {
    return NextResponse.json(
      { error: "prediction_failed", message: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
