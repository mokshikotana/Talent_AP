import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { loadArtifact, NUMERIC_FEATURES, NUMERIC_LABELS } from "@/lib/ml/pipeline";
import { CLASSES } from "@/lib/ml/labels";
import { renderFeature } from "@/lib/ml/text";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const report = new URL(req.url).searchParams.get("report") ?? "evaluation";
  try {
    if (report === "evaluation") return evaluationReport();
    if (report === "fairness") return fairnessReport();
    if (report === "fit") return await fitReport();
    return NextResponse.json({ error: "unknown_report", message: "report must be evaluation | fairness | fit" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: "report_failed", message: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}

function noArtifact() {
  return NextResponse.json(
    { error: "no_artifact", message: "Model artifact not found. Run `npx tsx scripts/seed-and-train.ts` first." },
    { status: 503 },
  );
}

function evaluationReport() {
  const art = loadArtifact()?.raw;
  if (!art) return noArtifact();
  // Global introspection: top text features per class by weight, top structured
  // feature weights per class — derived from the actual linear models.
  const textTopTokens = CLASSES.map((c, ci) => {
    const weights = art.textModel.weights;
    const scored = art.textModel.vocab.map((f, i) => ({ f, w: weights[i * 4 + ci] }));
    scored.sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
    return { class: c, tokens: scored.slice(0, 10).map((s) => ({ feature: renderFeature(s.f), weight: Math.round(s.w * 100) / 100 })) };
  });
  const structTop = CLASSES.map((c, ci) => {
    const weights = art.structured.weights;
    const feats = NUMERIC_FEATURES.map((name, j) => ({ name: NUMERIC_LABELS[name] ?? name, w: weights[j * 4 + ci] }));
    feats.sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
    return { class: c, features: feats.slice(0, 6).map((f) => ({ ...f, w: Math.round(f.w * 100) / 100 })) };
  });
  return NextResponse.json({
    version: art.version,
    dataSource: art.dataSource,
    trainedAt: art.trainedAt,
    seed: art.seed,
    provisionalEvaluation: art.provisionalEvaluation,
    costMatrix: art.costMatrix,
    costGuidance:
      "PROVISIONAL matrix (official evaluate.py absent): genuine→abusive = 10, abusive→genuine = 1, genuine subclass confusion = 2, correct = 0. Lower mean cost is better.",
    routingConfig: art.routingConfig,
    splitStrategy: art.splitStrategy,
    dataset: art.dataset,
    metrics: art.metrics,
    baselines: art.baselines,
    chronologyCheck: art.chronologyCheck,
    temperatures: {
      structured: art.structured.temperature,
      text: art.textModel.temperature,
      fusion: art.fusion.temperature,
    },
    globalExplain: { textTopTokens, structTop },
  });
}

function fairnessReport() {
  const art = loadArtifact()?.raw;
  if (!art) return noArtifact();
  return NextResponse.json({
    version: art.version,
    dataSource: art.dataSource,
    evaluatedOn: `test split (n=${art.dataset.splits.test})`,
    provisionalEvaluation: art.provisionalEvaluation,
    sections: art.fairness,
    languages: art.dataset.languages,
    disclaimer:
      "Rates similar across groups are not treated as proof of fairness — error-rate parity (FPR/FNR), Wilson 95% intervals and small-sample warnings are reported. Language and customer history are never direct routing inputs.",
  });
}

async function fitReport() {
  // Live aggregation over persisted data (updates as uploads arrive).
  const topByCount = (
    await db.execute(sql`
      SELECT rc.product_id AS pid, p.name, p.category, p.price_inr, p.fit_notes, p.size_chart,
             count(*)::int AS eligible_orders,
             count(*) FILTER (WHERE rc.label = 'genuine_fit_issue')::int AS fit_cases
      FROM return_cases rc JOIN products p ON p.id = rc.product_id
      WHERE rc.source = 'synthetic-demo'
      GROUP BY rc.product_id, p.name, p.category, p.price_inr, p.fit_notes, p.size_chart
      HAVING count(*) FILTER (WHERE rc.label = 'genuine_fit_issue') > 0
      ORDER BY fit_cases DESC
      LIMIT 5
    `)
  ).rows as {
    pid: string; name: string; category: string; price_inr: number; fit_notes: string;
    size_chart: unknown; eligible_orders: number; fit_cases: number;
  }[];

  const topByRate = (
    await db.execute(sql`
      SELECT rc.product_id AS pid, p.name,
             count(*)::int AS eligible_orders,
             count(*) FILTER (WHERE rc.label = 'genuine_fit_issue')::int AS fit_cases
      FROM return_cases rc JOIN products p ON p.id = rc.product_id
      WHERE rc.source = 'synthetic-demo'
      GROUP BY rc.product_id, p.name
      HAVING count(*) >= 120
      ORDER BY (count(*) FILTER (WHERE rc.label = 'genuine_fit_issue'))::float / count(*) DESC
      LIMIT 5
    `)
  ).rows as { pid: string; name: string; eligible_orders: number; fit_cases: number }[];

  // Complaint extraction for top-by-count products: tokenize their actual
  // fit-issue reasons and count domain terms. Real computation, no fabrication.
  const complaintLexicon = [
    "tight", "loose", "chota", "chhota", "bada", "small", "big", "snug", "short", "long",
    "waist", "chest", "shoulders", "sleeves", "length", "hips", "toe", "width", "heel",
    "टाइट", "छोटा", "ढीली",
  ];
  const fitDetails = await Promise.all(
    topByCount.map(async (p) => {
      const reasons = (
        await db.execute(sql`
          SELECT reason_text FROM return_cases
          WHERE product_id = ${p.pid} AND label = 'genuine_fit_issue'
          LIMIT 2000
        `)
      ).rows as { reason_text: string }[];
      const counts = new Map<string, number>();
      let mentions = 0;
      for (const r of reasons) {
        const low = r.reason_text.toLowerCase();
        let any = false;
        for (const term of complaintLexicon) {
          if (low.includes(term)) {
            counts.set(term, (counts.get(term) ?? 0) + 1);
            any = true;
          }
        }
        if (any) mentions++;
      }
      const complaints = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      const fitRate = p.eligible_orders > 0 ? p.fit_cases / p.eligible_orders : 0;
      const runsSmall = /runs approximately one size small/i.test(p.fit_notes);
      const runsLarge = /runs generous/i.test(p.fit_notes);
      const suggestions: string[] = [];
      if (runsSmall && fitRate > 0.3) {
        suggestions.push(
          `Catalogue note says this pattern runs one size small and the observed fit-return rate is ${(fitRate * 100).toFixed(1)
          }% — recommend surfacing “order one size up” guidance on the PDP and adding garment measurements to the chart.`,
        );
      } else if (runsLarge && fitRate > 0.3) {
        suggestions.push(
          `Catalogue note says the cut runs generous (observed fit-return rate ${(fitRate * 100).toFixed(1)}%) — recommend “consider sizing down” guidance and a fit quiz.`,
        );
      } else {
        suggestions.push(
          "Fit bias is not extreme for this product — prioritize clarifying measurement definitions (chest/waist/length) on the PDP chart before changing size logic.",
        );
      }
      return {
        productId: p.pid,
        name: p.name,
        category: p.category,
        priceInr: p.price_inr,
        eligibleOrders: p.eligible_orders,
        fitCases: p.fit_cases,
        fitRate,
        complaints: complaints.map(([term, n]) => ({ term, n })),
        complaintCoverage: reasons.length ? mentions / reasons.length : 0,
        sizeChart: p.size_chart,
        fitNotes: p.fit_notes,
        suggestions,
      };
    }),
  );

  const [totals] = (
    await db.execute(sql`
      SELECT count(*)::int AS fit_total FROM return_cases WHERE label = 'genuine_fit_issue'
    `)
  ).rows as { fit_total: number }[];

  return NextResponse.json({
    dataSource: "synthetic-demo (labeled)",
    rankingNote:
      "Primary rank: raw fit-return volume (business impact). Secondary rank: fit-return rate among eligible cases (min 120 eligible). Rate uses returns as the denominator proxy — official order-level denominators were not part of the available data.",
    totalFitCases: totals.fit_total,
    topByVolume: fitDetails,
    topByRate: topByRate.map((r) => ({
      productId: r.pid,
      name: r.name,
      eligibleOrders: r.eligible_orders,
      fitCases: r.fit_cases,
      fitRate: r.eligible_orders > 0 ? r.fit_cases / r.eligible_orders : 0,
    })),
  });
}
