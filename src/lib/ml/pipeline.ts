// Runtime inference pipeline: loads the trained artifact once per process and
// produces calibrated four-class probabilities, three-way routing, and
// evidence-backed explanations. Feature schema and vocab are stored IN the
// artifact so inference preprocessing bit-matches training preprocessing.

import fs from "node:fs";
import path from "node:path";
import {
  CLASSES,
  MODEL_VERSION,
  ROUTING_CONFIG,
  type CaseInput,
  type Explanation,
  type Prediction,
  type ReturnClass,
} from "./labels";
import { routeCase } from "./evaluator";
import { applyTemperature, logitsDense, logitsSparse, softmax } from "./softmax";
import {
  buildVocabulary,
  detectLanguage,
  renderFeature,
  topContributions,
  vectorize,
  type SparseVec,
  type TextVectorizer,
} from "./text";
import type { EvalReport } from "./evaluator";
import type { FairnessReportSection } from "./fairness";

export const NUMERIC_FEATURES = [
  "logOrderValue",
  "quantity",
  "discountPct",
  "deliveryDays",
  "daysSinceDelivery",
  "logTenureDays",
  "priorOrders12m",
  "priorReturns12m",
  "priorReturnRate",
  "logLifetimeOrders",
  "historyMissing",
] as const;

export const NUMERIC_LABELS: Record<string, string> = {
  logOrderValue: "order value",
  quantity: "quantity",
  discountPct: "discount depth",
  deliveryDays: "delivery time",
  daysSinceDelivery: "days since delivery",
  logTenureDays: "customer tenure",
  priorOrders12m: "prior orders (12m)",
  priorReturns12m: "prior returns (12m)",
  priorReturnRate: "prior return rate",
  logLifetimeOrders: "lifetime orders",
  historyMissing: "history unavailable flag",
};

export interface FeatureSchema {
  means: number[];
  stds: number[];
  categoricalValues: Record<"paymentMethod" | "category" | "region", string[]>;
}

export interface ModelArtifact {
  version: string;
  kind: "fused";
  seed: number;
  dataSource: string;
  trainedAt: string;
  provisionalEvaluation: true;
  classes: ReturnClass[];
  schema: FeatureSchema;
  structured: { weights: number[]; bias: number[]; temperature: number };
  textModel: { vocab: string[]; idf: number[]; docCount: number; weights: number[]; bias: number[]; temperature: number };
  fusion: { weights: number[]; bias: number[]; temperature: number };
  costMatrix: number[][];
  routingConfig: typeof ROUTING_CONFIG;
  metrics: Record<string, EvalReport>;
  baselines: Record<string, EvalReport>;
  chronologyCheck: { note: string; earlyMeanCost: number; lateMeanCost: number; earlyN: number; lateN: number };
  splitStrategy: string;
  fairness: FairnessReportSection[];
  dataset: {
    total: number;
    perClass: Record<string, number>;
    splits: Record<string, number>;
    languages: Record<string, number>;
    customers: number;
    products: number;
  };
}

export function numericRow(c: CaseInput): number[] {
  const tenure = c.customerTenureDays ?? 0;
  const priorOrders = c.priorOrders12m ?? 0;
  const priorReturns = c.priorReturns12m ?? 0;
  const historyMissing = c.customerTenureDays == null || c.priorOrders12m == null ? 1 : 0;
  return [
    Math.log1p(Math.max(0, c.orderValue)),
    c.quantity,
    c.discountPct,
    c.deliveryDays,
    c.daysSinceDelivery,
    Math.log1p(Math.max(0, tenure)),
    priorOrders,
    priorReturns,
    priorReturns / Math.max(1, priorOrders),
    Math.log1p(Math.max(0, c.accountOrdersLifetime ?? 0)),
    historyMissing,
  ];
}

export function structuredVector(c: CaseInput, schema: FeatureSchema): number[] {
  const nums = numericRow(c).map((v, i) => (v - schema.means[i]) / (schema.stds[i] || 1));
  const out = nums.slice();
  const cats: [keyof FeatureSchema["categoricalValues"], string][] = [
    ["paymentMethod", c.paymentMethod || "unknown"],
    ["category", c.category || "unknown"],
    ["region", c.region || "unknown"],
  ];
  for (const [name, value] of cats) {
    const values = schema.categoricalValues[name];
    for (const v of values) out.push(v === value ? 1 : 0);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Artifact loading (cached per process)
// ---------------------------------------------------------------------------

interface Hydrated {
  raw: ModelArtifact;
  structW: Float64Array;
  structB: Float64Array;
  textW: Float64Array;
  textB: Float64Array;
  fusionW: Float64Array;
  fusionB: Float64Array;
  vectorizer: TextVectorizer;
}

const globalCache = globalThis as unknown as { __rgArtifact?: Hydrated | null };

export function artifactExists(): boolean {
  try {
    return fs.existsSync(artifactPath());
  } catch {
    return false;
  }
}

export function artifactPath(): string {
  return path.join(process.cwd(), "artifacts", "model.json");
}

export function loadArtifact(): Hydrated | null {
  if (globalCache.__rgArtifact !== undefined) return globalCache.__rgArtifact;
  try {
    const raw = JSON.parse(fs.readFileSync(artifactPath(), "utf8")) as ModelArtifact;
    const index: Record<string, number> = {};
    raw.textModel.vocab.forEach((f, i) => (index[f] = i));
    const vectorizer: TextVectorizer = {
      vocab: raw.textModel.vocab,
      index,
      idf: raw.textModel.idf,
      docCount: raw.textModel.docCount,
    };
    globalCache.__rgArtifact = {
      raw,
      structW: Float64Array.from(raw.structured.weights),
      structB: Float64Array.from(raw.structured.bias),
      textW: Float64Array.from(raw.textModel.weights),
      textB: Float64Array.from(raw.textModel.bias),
      fusionW: Float64Array.from(raw.fusion.weights),
      fusionB: Float64Array.from(raw.fusion.bias),
      vectorizer,
    };
  } catch {
    globalCache.__rgArtifact = null;
  }
  return globalCache.__rgArtifact;
}

export function invalidateArtifactCache() {
  globalCache.__rgArtifact = undefined;
}

// ---------------------------------------------------------------------------
// Prediction
// ---------------------------------------------------------------------------

function toRecord(p: number[]): Record<ReturnClass, number> {
  return {
    abusive: p[0],
    genuine_quality_issue: p[1],
    genuine_fit_issue: p[2],
    genuine_wrong_item: p[3],
  };
}

export interface RawProbs {
  structured: Record<ReturnClass, number>;
  text: Record<ReturnClass, number>;
  fused: Record<ReturnClass, number>;
  sv: SparseVec;
  sx: number[];
}

export function rawPredict(art: Hydrated, input: CaseInput): RawProbs {
  const nClass = 4;
  const sx = structuredVector(input, art.raw.schema);
  const structLogits = logitsDense(art.structW, art.structB, sx, nClass);
  const structP = applyTemperature(softmax(structLogits), art.raw.structured.temperature);
  const sv = vectorize(input.reasonText || "", art.vectorizer);
  const textLogits = logitsSparse(art.textW, art.textB, sv, nClass);
  const textP = applyTemperature(softmax(textLogits), art.raw.textModel.temperature);
  const stack = [...structP, ...textP];
  const fusedLogits = logitsDense(art.fusionW, art.fusionB, stack, nClass);
  const fusedP = applyTemperature(softmax(fusedLogits), art.raw.fusion.temperature);
  return { structured: toRecord(structP), text: toRecord(textP), fused: toRecord(fusedP), sv, sx };
}

// ---------------------------------------------------------------------------
// Evidence-backed explanation (no fabricated facts — everything below is
// derived from the input row and linear model term contributions)
// ---------------------------------------------------------------------------

function describeNumeric(name: string, raw: number, z: number): string | null {
  const label = NUMERIC_LABELS[name] ?? name;
  if (Math.abs(z) < 0.45) return null;
  const dir = z > 0 ? "high" : "low";
  switch (name) {
    case "logOrderValue":
      return `order value ₹${Math.round(Math.expm1(raw)).toLocaleString("en-IN")} is ${dir} versus typical returns`;
    case "priorReturnRate": {
      const pct = (raw * 100).toFixed(0);
      return `prior return rate of ${pct}% is ${dir} versus typical customers`;
    }
    case "priorOrders12m":
      return `${Math.round(raw)} prior orders in 12 months (${dir} vs typical)`;
    case "priorReturns12m":
      return `${Math.round(raw)} prior returns in 12 months (${dir} vs typical)`;
    case "logTenureDays": {
      const d = Math.round(Math.expm1(raw));
      return `customer tenure of ${d.toLocaleString("en-IN")} days is ${dir} versus typical`;
    }
    case "daysSinceDelivery":
      return `return raised ${Math.round(raw)} days after delivery (${dir} vs typical)`;
    case "discountPct":
      return `discount depth of ${Math.round(raw)}% is ${dir} versus typical orders`;
    case "deliveryDays":
      return `delivery took ${Math.round(raw)} days (${dir} vs typical)`;
    case "quantity":
      return `quantity ${Math.round(raw)} (${dir} vs typical)`;
    case "historyMissing":
      return raw > 0.5 ? "historical return information unavailable for this customer" : null;
    default:
      return `${label} is ${dir} versus typical returns`;
  }
}

export function predictCase(input: CaseInput): Prediction & { detectedLanguage: string; modelVersion: string } {
  const art = loadArtifact();
  const lang = detectLanguage(input.reasonText || "");

  const facts: string[] = [];
  if (!input.reasonText.trim()) facts.push("No reason text was provided by the customer.");
  else
    facts.push(
      `Customer reason (${lang === "hi" ? "Hindi (Devanagari)" : lang === "hinglish" ? "Hinglish / romanized Hindi" : "English"}): "${input.reasonText.slice(0, 180)}${input.reasonText.length > 180 ? "…" : ""}"`,
    );
  facts.push(`Order value ₹${input.orderValue.toLocaleString("en-IN")}, quantity ${input.quantity}, discount ${input.discountPct}%.`);
  facts.push(`Return raised ${input.daysSinceDelivery} days after delivery (30-day free-return window).`);
  if (input.customerTenureDays != null) {
    facts.push(`Customer tenure ${input.customerTenureDays.toLocaleString("en-IN")} days; ${input.priorReturns12m ?? 0} returns across ${input.priorOrders12m ?? 0} orders in the last 12 months.`);
  }

  if (!art) return heuristicPredict(input, lang, facts);

  const { raw } = art;
  const p = rawPredict(art, input);
  const probs = p.fused;
  const arr = CLASSES.map((c) => probs[c]);
  const predictedIdx = arr.indexOf(Math.max(...arr));
  const predictedClass = CLASSES[predictedIdx];
  const decision = routeCase(probs, raw.routingConfig);

  // Evidence: linear-term contributions are exact for the linear base models.
  const supporting: string[] = [];
  const opposing: string[] = [];
  const missing: string[] = [];

  const nums = numericRow(input);
  for (let j = 0; j < NUMERIC_FEATURES.length; j++) {
    const z = p.sx[j];
    const contrib = z * art.structW[j * 4 + predictedIdx];
    const text = describeNumeric(NUMERIC_FEATURES[j], nums[j], z);
    if (text && Math.abs(contrib) > 0.03) {
      (contrib > 0 ? supporting : opposing).push(
        `${contrib > 0 ? "Supports" : "Opposes"} “${predictedClass}”: ${text}.`,
      );
    }
  }
  const tokContribs = topContributions(art.vectorizer, art.textW, 4, predictedIdx, p.sv, 6);
  for (const t of tokContribs) {
    if (Math.abs(t.contribution) < 0.02) continue;
    (t.contribution > 0 ? supporting : opposing).push(
      `${t.contribution > 0 ? "Supports" : "Opposes"} “${predictedClass}”: reason contains ${renderFeature(t.feature)}.`,
    );
  }

  if (input.customerTenureDays == null || input.priorOrders12m == null) {
    missing.push("Historical return information is unavailable for this customer (treated as unknown — never as suspicion).");
  }
  if (!input.reasonText.trim()) missing.push("Reason text missing — language signal unavailable; consider requesting a statement.");
  const sArr = CLASSES.map((c) => p.structured[c]);
  const tArr = CLASSES.map((c) => p.text[c]);
  const sPred = CLASSES[sArr.indexOf(Math.max(...sArr))];
  const tPred = CLASSES[tArr.indexOf(Math.max(...tArr))];
  const agreement =
    sPred === tPred
      ? `Structured and text models agree on “${sPred}” (structured ${(Math.max(...sArr) * 100).toFixed(0)}%, text ${(Math.max(...tArr) * 100).toFixed(0)}%).`
      : `Models disagree — structured model leans “${sPred}” (${(Math.max(...sArr) * 100).toFixed(0)}%), text model leans “${tPred}” (${(Math.max(...tArr) * 100).toFixed(0)}%). This conflict is why the fusion layer and human review exist.`;

  const explanation: Explanation = {
    facts,
    supporting: supporting.slice(0, 6),
    opposing: opposing.slice(0, 4),
    missing,
    recommendedAction: decision.rationale,
    modelAgreement: agreement,
  };

  return {
    probs,
    predictedClass,
    routing: decision.routing,
    expectedCost: decision.expectedCost,
    expectedCostByAction: decision.expectedCostByAction,
    confidence: Math.max(...arr),
    perModel: { structured: p.structured, text: p.text },
    explanation,
    detectedLanguage: lang,
    modelVersion: raw.version,
  };
}

/**
 * Honest fallback used ONLY when no trained artifact exists (e.g. before seeding).
 * Clearly labeled demo logic — keyword heuristics, never presented as a trained model.
 */
function heuristicPredict(
  input: CaseInput,
  lang: string,
  facts: string[],
): Prediction & { detectedLanguage: string; modelVersion: string } {
  const t = (input.reasonText || "").toLowerCase();
  const has = (words: string[]) => words.some((w) => t.includes(w));
  const destructive = ["khali", "empty", "missing item", "never arrived", "pehna", "wore", "photo shoot", "paisa wapas"];
  const quality = ["zip", "stitch", "silai", "seam", "tore", "tear", "defect", "kharab", "phat", "tuta", "button", "fading", "hole", "सिलाई", "ज़िप", "फट"];
  const fit = ["tight", "loose", "size", "chota", "bada", "fit", "साइज़", "टाइट", "ढीली", "length"];
  const wrong = ["wrong", "different", "galat", "गलत", "colour", "color", "another"];
  const s: Record<ReturnClass, number> = {
    abusive: has(destructive) ? 0.5 : 0.08,
    genuine_quality_issue: has(quality) ? 0.42 : 0.16,
    genuine_fit_issue: has(fit) ? 0.4 : 0.16,
    genuine_wrong_item: has(wrong) ? 0.42 : 0.16,
  };
  if ((input.priorReturns12m ?? 0) > Math.max(2, (input.priorOrders12m ?? 1) * 0.5)) s.abusive += 0.2;
  const total = Object.values(s).reduce((a, b) => a + b, 0);
  const probs = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v / total])) as Record<ReturnClass, number>;
  const arr = CLASSES.map((c) => probs[c]);
  const predictedClass = CLASSES[arr.indexOf(Math.max(...arr))];
  const decision = routeCase(probs, ROUTING_CONFIG);
  const explanation: Explanation = {
    facts: [...facts, "DEMO LOGIC: no trained model artifact found — keyword heuristic used. Seed the demo dataset to activate the trained pipeline."],
    supporting: [],
    opposing: [],
    missing: input.reasonText ? [] : ["Reason text missing."],
    recommendedAction: decision.rationale,
    modelAgreement: "Heuristic fallback active; structured/text model comparison unavailable.",
  };
  return {
    probs,
    predictedClass,
    routing: decision.routing,
    expectedCost: decision.expectedCost,
    expectedCostByAction: decision.expectedCostByAction,
    confidence: Math.max(...arr),
    perModel: { structured: probs, text: probs },
    explanation,
    detectedLanguage: lang,
    modelVersion: `${MODEL_VERSION}-heuristic-fallback`,
  };
}

export { buildVocabulary };
