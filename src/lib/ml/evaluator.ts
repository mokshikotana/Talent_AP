// Official evaluation adapter (REPLACEABLE). No official evaluate.py / cost matrix
// exists in this repository — this module implements the documented PROVISIONAL
// cost-weighted contract plus routing policy. To use an official evaluator later,
// replace PROVISIONAL_COST_MATRIX and, if supplied, shell out to its CLI here.

import {
  CLASSES,
  PROVISIONAL_COST_MATRIX,
  ROUTING_CONFIG,
  type ReturnClass,
  type Routing,
} from "./labels";

export const CLASS_INDEX: Record<ReturnClass, number> = {
  abusive: 0,
  genuine_quality_issue: 1,
  genuine_fit_issue: 2,
  genuine_wrong_item: 3,
};

export interface ClassMetrics {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface EvalReport {
  n: number;
  meanCost: number; // official-style objective (lower is better)
  costMatrix: number[][];
  accuracy: number;
  macroF1: number;
  balancedAccuracy: number;
  brier: number | null; // multiclass Brier (null when probs unavailable)
  nll: number | null;
  confusion: number[][]; // [true][pred]
  perClass: Record<ReturnClass, ClassMetrics>;
  routing?: {
    distribution: Record<Routing, number>;
    meanRealizedRoutingCost: number;
    reviewWorkloadPct: number;
  };
}

export function argmax(p: number[]): number {
  let bi = 0;
  for (let i = 1; i < p.length; i++) if (p[i] > p[bi]) bi = i;
  return bi;
}

/** Mean cost per case under the (provisional or official) cost matrix. */
export function costScore(preds: number[], ys: number[], matrix = PROVISIONAL_COST_MATRIX): number {
  let s = 0;
  for (let i = 0; i < preds.length; i++) s += matrix[ys[i]][preds[i]];
  return s / Math.max(1, preds.length);
}

export function evaluate(
  ys: number[],
  probs: number[][] | null,
  predsIn: number[] | null,
  matrix = PROVISIONAL_COST_MATRIX,
): EvalReport {
  const n = ys.length;
  const k = matrix.length;
  const preds = predsIn ?? (probs as number[][]).map(argmax);
  const confusion = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  let correct = 0;
  for (let i = 0; i < n; i++) {
    confusion[ys[i]][preds[i]]++;
    if (ys[i] === preds[i]) correct++;
  }
  const perClass = {} as Record<ReturnClass, ClassMetrics>;
  const f1s: number[] = [];
  const recalls: number[] = [];
  for (let c = 0; c < k; c++) {
    let tp = confusion[c][c];
    let fp = 0;
    let fn = 0;
    for (let j = 0; j < k; j++) {
      if (j !== c) {
        fp += confusion[j][c];
        fn += confusion[c][j];
      }
    }
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const support = confusion[c].reduce((a, b) => a + b, 0);
    perClass[CLASSES[c]] = { precision, recall, f1, support };
    f1s.push(f1);
    recalls.push(recall);
  }
  let brier: number | null = null;
  let nllVal: number | null = null;
  if (probs) {
    let bs = 0;
    let ns = 0;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < k; c++) {
        const o = c === ys[i] ? 1 : 0;
        bs += (probs[i][c] - o) * (probs[i][c] - o);
      }
      ns += -Math.log(Math.max(probs[i][ys[i]], 1e-12));
    }
    brier = bs / n;
    nllVal = ns / n;
  }
  return {
    n,
    meanCost: costScore(preds, ys, matrix),
    costMatrix: matrix,
    accuracy: correct / Math.max(1, n),
    macroF1: f1s.reduce((a, b) => a + b, 0) / k,
    balancedAccuracy: recalls.reduce((a, b) => a + b, 0) / k,
    brier,
    nll: nllVal,
    confusion,
    perClass,
  };
}

export interface RoutingDecision {
  routing: Routing;
  expectedCostByAction: Record<Routing, number>;
  expectedCost: number;
  rationale: string;
}

/**
 * Three-way operational routing by expected-cost minimization with an
 * uncertainty guard. Costs are OPERATIONAL (configurable) — distinct from the
 * benchmark cost matrix. Escalation is never a denial: unverified scores cannot
 * block a return; only humans decide outcomes.
 */
export function routeCase(
  probs: Record<ReturnClass, number>,
  cfg = ROUTING_CONFIG,
): RoutingDecision {
  const pAbusive = probs.abusive;
  const pArr = CLASSES.map((c) => probs[c]);
  const maxP = Math.max(...pArr);
  const ec: Record<Routing, number> = {
    "AUTO-APPROVE": pAbusive * cfg.fraudLossApprove,
    INSPECT: cfg.reviewCostInspect,
    ESCALATE: cfg.escalateCost,
  };
  let routing: Routing = "INSPECT";
  if (ec["AUTO-APPROVE"] <= ec.INSPECT && pAbusive <= cfg.autoApproveMaxAbusiveProb && maxP >= cfg.uncertaintyThreshold) {
    routing = "AUTO-APPROVE";
  } else if (pAbusive >= cfg.escalateMinAbusiveProb) {
    // Risk-policy escalation: abuse probability past the documented threshold goes
    // to a specialist — regardless of labor costs, because a wrong auto-approval at
    // this risk level is a policy breach, not a bookkeeping issue.
    routing = "ESCALATE";
  }
  let rationale: string;
  if (routing === "AUTO-APPROVE") {
    rationale = `Expected approval cost ${ec["AUTO-APPROVE"].toFixed(3)} is below inspection cost ${ec.INSPECT.toFixed(2)} and confidence ${(maxP * 100).toFixed(0)}% clears the uncertainty floor.`;
  } else if (routing === "ESCALATE") {
    rationale = `P(abusive)=${(pAbusive * 100).toFixed(0)}% makes approval costlier than specialist review; routed to a supervisor for evidence-gathering — not an automatic denial.`;
  } else {
    rationale =
      maxP < cfg.uncertaintyThreshold
        ? `Top-class confidence ${(maxP * 100).toFixed(0)}% is below the ${cfg.uncertaintyThreshold * 100}% uncertainty floor; ambiguous signals warrant human review.`
        : `Expected costs favour a standard manual inspection (inspect ${ec.INSPECT.toFixed(2)} vs approve ${ec["AUTO-APPROVE"].toFixed(3)}).`;
  }
  return { routing, expectedCostByAction: ec, expectedCost: ec[routing], rationale };
}

/** Realized operational cost when a routing decision plays out against ground truth. */
export function realizedRoutingCost(
  routing: Routing,
  trueClass: ReturnClass,
  cfg = ROUTING_CONFIG,
): number {
  if (routing === "AUTO-APPROVE") return trueClass === "abusive" ? cfg.fraudLossApprove : 0;
  if (routing === "INSPECT") return cfg.reviewCostInspect;
  return cfg.escalateCost;
}

export function withRouting(
  report: EvalReport,
  ys: number[],
  probs: number[][],
  cfg = ROUTING_CONFIG,
): EvalReport {
  const dist: Record<Routing, number> = { "AUTO-APPROVE": 0, INSPECT: 0, ESCALATE: 0 };
  let realized = 0;
  for (let i = 0; i < ys.length; i++) {
    const p = CLASSES.map((c, ci) => probs[i][ci]);
    const rec: Record<ReturnClass, number> = {
      abusive: p[0],
      genuine_quality_issue: p[1],
      genuine_fit_issue: p[2],
      genuine_wrong_item: p[3],
    };
    const d = routeCase(rec, cfg);
    dist[d.routing]++;
    realized += realizedRoutingCost(d.routing, CLASSES[ys[i]], cfg);
  }
  const workload = ((dist.INSPECT + dist.ESCALATE) / Math.max(1, ys.length)) * 100;
  return {
    ...report,
    routing: {
      distribution: dist,
      meanRealizedRoutingCost: realized / Math.max(1, ys.length),
      reviewWorkloadPct: workload,
    },
  };
}
