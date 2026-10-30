// Fairness auditing across the three required groupings:
//   1. New vs established customers
//   2. Low-value vs other orders
//   3. English vs non-English reasons
// Rates are reported WITH uncertainty (Wilson 95% CIs) and small-sample warnings.
// Similar routing rates are NOT treated as proof of fairness — error-rate parity
// (FPR/FNR for the "abusive" decision) and cost are reported alongside.

import type { ReturnClass, Routing } from "./labels";

export interface FairnessRowInput {
  label: ReturnClass | null;
  predictedClass: ReturnClass;
  routing: Routing;
  realizedCost: number;
  customerTenureDays: number | null;
  historyMissing: boolean;
  orderValue: number;
  language: string; // en | hinglish | hi | missing
}

export interface GroupConfig {
  id: string;
  title: string;
  description: string;
  thresholdNote: string;
  groupOf: (r: FairnessRowInput) => string; // returns group key
  groups: { key: string; label: string }[];
}

export const FAIRNESS_GROUPINGS: GroupConfig[] = [
  {
    id: "tenure",
    title: "New vs established customers",
    description:
      "New customers must not be treated as suspicious merely because history is absent. The model receives an explicit 'history unavailable' indicator instead of imputing risk.",
    thresholdNote: "New = tenure < 180 days OR history unavailable (configurable).",
    groupOf: (r) => (r.historyMissing || (r.customerTenureDays ?? 0) < 180 ? "new" : "established"),
    groups: [
      { key: "new", label: "New / no history" },
      { key: "established", label: "Established (180d+)" },
    ],
  },
  {
    id: "order_value",
    title: "Low-value vs other orders",
    description:
      "Low-value orders are not presumed more fraudulent. Value bands are audited for error-rate parity and cost parity.",
    thresholdNote: "Low value = order < ₹1,500 (configurable threshold).",
    groupOf: (r) => (r.orderValue < 1500 ? "low" : "other"),
    groups: [
      { key: "low", label: "Low value (< ₹1,500)" },
      { key: "other", label: "All other orders" },
    ],
  },
  {
    id: "language",
    title: "English vs non-English reasons",
    description:
      "Hinglish, transliterated Hindi and Devanagari are legitimate customer inputs. Language is audited for disparate error rates; it is never a routing input by policy.",
    thresholdNote: "Non-English = detected Hinglish / romanized Hindi / Devanagari.",
    groupOf: (r) => (r.language === "en" ? "en" : "non-en"),
    groups: [
      { key: "en", label: "English" },
      { key: "non-en", label: "Non-English" },
    ],
  },
];

export interface GroupMetrics {
  key: string;
  label: string;
  n: number;
  routingRates: Record<Routing, number>;
  fprAbusive: number | null; // P(pred=abusive | label genuine)
  fnrAbusive: number | null; // P(pred=genuine | label abusive)
  precisionAbusive: number | null;
  recallAbusive: number | null;
  meanCost: number | null; // realized routing cost
  ci: { fpr95: [number, number] | null; escalate95: [number, number] };
  smallSampleWarning: string | null;
}

/** Wilson score interval for a binomial proportion. */
export function wilson(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

function groupMetrics(key: string, label: string, rows: FairnessRowInput[]): GroupMetrics {
  const n = rows.length;
  const rc: Record<Routing, number> = { "AUTO-APPROVE": 0, INSPECT: 0, ESCALATE: 0 };
  for (const r of rows) rc[r.routing]++;
  const routingRates: Record<Routing, number> = {
    "AUTO-APPROVE": n ? rc["AUTO-APPROVE"] / n : 0,
    INSPECT: n ? rc.INSPECT / n : 0,
    ESCALATE: n ? rc.ESCALATE / n : 0,
  };
  const labeled = rows.filter((r) => r.label !== null);
  let fpr: number | null = null;
  let fnr: number | null = null;
  let precision: number | null = null;
  let recall: number | null = null;
  let fprCi: [number, number] | null = null;
  if (labeled.length > 0) {
    const genuine = labeled.filter((r) => r.label !== "abusive");
    const abusive = labeled.filter((r) => r.label === "abusive");
    const fp = genuine.filter((r) => r.predictedClass === "abusive").length;
    const fn = abusive.filter((r) => r.predictedClass !== "abusive").length;
    const tp = abusive.length - fn;
    if (genuine.length > 0) {
      fpr = fp / genuine.length;
      fprCi = wilson(fp, genuine.length);
    }
    if (abusive.length > 0) fnr = fn / abusive.length;
    if (tp + fp > 0) precision = tp / (tp + fp);
    if (abusive.length > 0) recall = tp / abusive.length;
  }
  const meanCost = n > 0 ? rows.reduce((s, r) => s + r.realizedCost, 0) / n : null;
  let warning: string | null = null;
  if (n < 200) warning = `Small sample (n=${n}) — treat rates with caution.`;
  return {
    key,
    label,
    n,
    routingRates,
    fprAbusive: fpr,
    fnrAbusive: fnr,
    precisionAbusive: precision,
    recallAbusive: recall,
    meanCost,
    ci: { fpr95: fprCi, escalate95: wilson(rc.ESCALATE, n) },
    smallSampleWarning: warning,
  };
}

export interface FairnessReportSection {
  id: string;
  title: string;
  description: string;
  thresholdNote: string;
  groups: GroupMetrics[];
  findings: string[];
}

export function buildFairnessReport(rows: FairnessRowInput[]): FairnessReportSection[] {
  return FAIRNESS_GROUPINGS.map((cfg) => {
    const buckets = new Map<string, FairnessRowInput[]>();
    for (const g of cfg.groups) buckets.set(g.key, []);
    for (const r of rows) buckets.get(cfg.groupOf(r))?.push(r);
    const groups = cfg.groups.map((g) => groupMetrics(g.key, g.label, buckets.get(g.key) ?? []));
    const findings: string[] = [];
    if (groups.length === 2 && groups[0].n > 0 && groups[1].n > 0) {
      const [a, b] = groups;
      const escGap = a.routingRates.ESCALATE - b.routingRates.ESCALATE;
      findings.push(
        `Escalation-rate gap (${a.label} − ${b.label}): ${(escGap * 100).toFixed(1)} pts.`,
      );
      if (a.fprAbusive !== null && b.fprAbusive !== null) {
        const fprGap = a.fprAbusive - b.fprAbusive;
        findings.push(
          `Wrongful-suspicion rate (FPR) gap: ${(fprGap * 100).toFixed(1)} pts — ${a.label} ${(
            a.fprAbusive * 100
          ).toFixed(2)}% vs ${b.label} ${(b.fprAbusive * 100).toFixed(2)}%.`,
        );
      }
      if (a.fnrAbusive !== null && b.fnrAbusive !== null) {
        findings.push(
          `Missed-abuse rate (FNR): ${a.label} ${(a.fnrAbusive * 100).toFixed(1)}% vs ${b.label} ${(b.fnrAbusive * 100).toFixed(1)}%.`,
        );
      }
    }
    return {
      id: cfg.id,
      title: cfg.title,
      description: cfg.description,
      thresholdNote: cfg.thresholdNote,
      groups,
      findings,
    };
  });
}
