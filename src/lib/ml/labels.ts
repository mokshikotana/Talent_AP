// Shared contracts: classes, provisional cost matrix, routing policy configuration.
// NOTE: No official evaluate.py or published cost matrix exists in this repository
// (see PROJECT_STATUS.md). The matrix below encodes the brief's guidance
// ("wrongful suspicion costs ~10x a missed fraud") and is PROVISIONAL — it is
// replaceable here and exposed in the Model Evaluation Lab as configurable.

export const CLASSES = [
  "abusive",
  "genuine_quality_issue",
  "genuine_fit_issue",
  "genuine_wrong_item",
] as const;
export type ReturnClass = (typeof CLASSES)[number];

export const CLASS_META: Record<
  ReturnClass,
  { label: string; short: string; color: string; description: string }
> = {
  abusive: {
    label: "Abusive / policy-violating",
    short: "Abusive",
    color: "#a05e57",
    description:
      "Signals consistent with returns abuse (e.g. wardrobing, empty-box claims). A prediction is an operational signal, never proof of fraud.",
  },
  genuine_quality_issue: {
    label: "Genuine quality issue",
    short: "Quality",
    color: "#96684a",
    description: "Defect, damage or workmanship complaint consistent with a genuine grievance.",
  },
  genuine_fit_issue: {
    label: "Genuine fit issue",
    short: "Fit",
    color: "#8b6f47",
    description: "Sizing / fit mismatch — an opportunity to fix size guidance, not a customer fault.",
  },
  genuine_wrong_item: {
    label: "Genuine wrong item",
    short: "Wrong item",
    color: "#7d7396",
    description: "Customer reports receiving a different item, colour or variant than ordered.",
  },
};

export const ROUTINGS = ["AUTO-APPROVE", "INSPECT", "ESCALATE"] as const;
export type Routing = (typeof ROUTINGS)[number];

export const ROUTING_META: Record<Routing, { color: string; description: string }> = {
  "AUTO-APPROVE": {
    color: "#54705f",
    description: "Low-risk, policy-compliant. Sufficient evidence supports approval.",
  },
  INSPECT: {
    color: "#96684a",
    description: "Ambiguous, uncertain or incomplete evidence. Human review warranted.",
  },
  ESCALATE: {
    color: "#a05e57",
    description: "Specialist / supervisor attention under the documented risk policy. Not a denial.",
  },
};

/**
 * PROVISIONAL 4-class cost matrix, cost[true][pred].
 * Guidance from the brief: blocking a genuine customer (pred=abusive, true=genuine)
 * costs ~10x missing a fraudulent return (pred=genuine, true=abusive = 1).
 * Genuine-subclass confusions carry a small rework cost.
 */
export const PROVISIONAL_COST_MATRIX: number[][] = [
  // true: abusive
  [0, 1, 1, 1],
  // true: genuine_quality_issue
  [10, 0, 2, 2],
  // true: genuine_fit_issue
  [10, 2, 0, 2],
  // true: genuine_wrong_item
  [10, 2, 2, 0],
];

export const COST_GUIDANCE =
  "Provisional matrix — official evaluator not found in repository. Wrongful suspicion (genuine→abusive) = 10, missed abuse (abusive→genuine) = 1, genuine subclass confusion = 2, correct = 0. Direction: lower is better (mean cost per case).";

/** Operational routing costs — SEPARATE from the benchmark matrix. Configurable. */
export const ROUTING_CONFIG = {
  /** Loss when an abusive return is auto-approved (normalized units). */
  fraudLossApprove: 1.0,
  /** Labour cost of a manual inspection. */
  reviewCostInspect: 0.55,
  /** Labour cost of specialist escalation. */
  escalateCost: 1.1,
  /** Below this top-class probability the case is "uncertain" -> at least INSPECT. */
  uncertaintyThreshold: 0.35,
  /** Never auto-approve when P(abusive) exceeds this. */
  autoApproveMaxAbusiveProb: 0.35,
  /** P(abusive) at or above this routes to specialist review (risk policy, not denial). */
  escalateMinAbusiveProb: 0.5,
};

export interface CaseInput {
  orderValue: number;
  quantity: number;
  discountPct: number;
  deliveryDays: number;
  daysSinceDelivery: number;
  paymentMethod: string;
  category: string;
  region: string;
  customerTenureDays: number | null;
  priorOrders12m: number | null;
  priorReturns12m: number | null;
  accountOrdersLifetime: number | null;
  reasonText: string;
}

export interface Prediction {
  probs: Record<ReturnClass, number>;
  predictedClass: ReturnClass;
  routing: Routing;
  expectedCost: number;
  expectedCostByAction: Record<Routing, number>;
  confidence: number;
  perModel: {
    structured: Record<ReturnClass, number>;
    text: Record<ReturnClass, number>;
  };
  explanation: Explanation;
}

export interface Explanation {
  facts: string[];
  supporting: string[];
  opposing: string[];
  missing: string[];
  recommendedAction: string;
  modelAgreement: string;
}

export const POLICY = {
  returnWindowDays: 30,
  freeReturns: true,
  restockingFee: 0,
  summary:
    "30-day free returns. No restocking fee. Refunds are issued to the original payment method after the item is received and verified.",
};

export const MODEL_VERSION = "rg-demo-v1";
export const DATA_SOURCE_LABEL = "synthetic-demo";
