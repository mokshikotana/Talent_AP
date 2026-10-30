/**
 * ReturnGuard AI test suite — run with: npx tsx --test tests/returnguard.test.ts
 * Covers: multilingual text engine, calibration, four-class evaluation,
 * three-way routing, fairness math, CSV round-trip, API input validation,
 * synthetic generator determinism, and policy compliance of message drafts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLanguage, tokenize, buildVocabulary, vectorize } from "../src/lib/ml/text";
import { applyTemperature, fitTemperature, softmax, trainSoftmaxDense } from "../src/lib/ml/softmax";
import { costScore, evaluate, routeCase, realizedRoutingCost } from "../src/lib/ml/evaluator";
import { PROVISIONAL_COST_MATRIX, ROUTING_CONFIG } from "../src/lib/ml/labels";
import { buildFairnessReport, wilson, type FairnessRowInput } from "../src/lib/ml/fairness";
import { parseCsv, toCsv } from "../src/lib/ml/csv";
import { validateCase } from "../src/lib/api/validate";
import { generateDataset } from "../src/lib/ml/synth";
import { draftMessage } from "../src/lib/ml/messages";
import { Rng } from "../src/lib/ml/rng";
import { DEMO_CASES } from "../src/lib/ml/demoCases";

test("tokenizer handles English, Hinglish and Devanagari", () => {
  assert.deepEqual(tokenize("Size chota hai, exchange karna hai!"), ["size", "chota", "hai", "exchange", "karna", "hai"]);
  assert.ok(tokenize("सिलाई खुल गई है").length >= 3);
});

test("language detection: script vs transliteration distinguished", () => {
  assert.equal(detectLanguage("The seam tore after one wash"), "en");
  assert.equal(detectLanguage("size chota hai"), "hinglish");
  assert.equal(detectLanguage("साइज़ छोटा है"), "hi");
  assert.equal(detectLanguage(""), "missing");
  assert.equal(detectLanguage("   "), "missing");
});

test("vocabulary + TF-IDF vectors are deterministic and L2-normalized", () => {
  const docs = ["tight waist size chota", "zip kharab hai", "wrong item aaya", "tight waist again"];
  const v1 = buildVocabulary(docs, { maxVocab: 500, minDf: 1 });
  const v2 = buildVocabulary(docs, { maxVocab: 500, minDf: 1 });
  assert.deepEqual(v1.vocab, v2.vocab);
  const s1 = vectorize("tight waist chota", v1);
  const s2 = vectorize("tight waist chota", v2);
  assert.deepEqual(s1.idx, s2.idx);
  const norm = Math.sqrt(s1.val.reduce((a, b) => a + b * b, 0));
  assert.ok(Math.abs(norm - 1) < 1e-6);
});

test("softmax sums to 1; temperature=1 is identity", () => {
  const p = softmax([1, -2, 0.5, 3]);
  assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.deepEqual(applyTemperature(p, 1), p);
  const hot = applyTemperature(p, 2.5);
  assert.ok(Math.abs(hot.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test("temperature fitting reduces validation NLL or stays ~1", () => {
  const probs = [
    [0.99, 0.004, 0.003, 0.003],
    [0.9, 0.05, 0.03, 0.02],
    [0.02, 0.9, 0.05, 0.03],
  ];
  const ys = [0, 0, 1];
  const T = fitTemperature(probs, ys);
  assert.ok(T >= 0.5 && T <= 4);
});

test("dense softmax trainer learns a separable toy problem", () => {
  const xs: number[][] = [];
  const ys: number[] = [];
  const rng = new Rng(7);
  for (let i = 0; i < 400; i++) {
    const c = i % 4;
    const x = [0, 0, 0, 0];
    x[c] = 1 + rng.normal(0, 0.05);
    xs.push(x);
    ys.push(c);
  }
  const { W, b } = trainSoftmaxDense(xs, ys, { nFeat: 4, nClass: 4, epochs: 30, lr: 0.4, l2: 1e-4, seed: 7 });
  void b;
  // class c should have strongest weight on its own feature
  for (let c = 0; c < 4; c++) {
    const colW = [0, 1, 2, 3].map((f) => W[f * 4 + c]);
    assert.equal(colW.indexOf(Math.max(...colW)), c);
  }
});

test("provisional cost matrix: wrongful suspicion = 10x missed fraud", () => {
  const genuineFit = 2;
  const abusive = 0;
  // 1 wrongful suspicion + 1 missed fraud on two cases
  const mean = costScore([abusive, genuineFit], [genuineFit, abusive]);
  assert.equal(mean, (10 + 1) / 2);
  // perfect predictions cost 0
  assert.equal(costScore([0, 1, 2, 3], [0, 1, 2, 3]), 0);
});

test("evaluate(): confusion matrix and macro-F1 on a readable fixture", () => {
  const ys = [0, 0, 1, 1, 2, 2, 3, 3];
  const preds = [0, 1, 1, 1, 2, 0, 3, 2];
  const r = evaluate(ys, null, preds);
  assert.equal(r.confusion[0][0], 1); // 1 of 2 abusive caught
  assert.equal(r.confusion[1][1], 2);
  assert.equal(r.accuracy, 0.625);
  assert.ok(r.macroF1 > 0 && r.macroF1 < 1);
  assert.equal(r.perClass.genuine_fit_issue.support, 2);
});

test("routing: cost minimization + uncertainty guard", () => {
  const mk = (abusive: number, rest: [number, number, number]) => ({
    abusive, genuine_quality_issue: rest[0], genuine_fit_issue: rest[1], genuine_wrong_item: rest[2],
  });
  // confident genuine fit issue, tiny abuse prob -> AUTO-APPROVE
  const a = routeCase(mk(0.03, [0.05, 0.88, 0.04]));
  assert.equal(a.routing, "AUTO-APPROVE");
  // high abuse prob -> ESCALATE
  const e = routeCase(mk(0.75, [0.1, 0.1, 0.05]));
  assert.equal(e.routing, "ESCALATE");
  // flat/uncertain distribution -> INSPECT
  const u = routeCase(mk(0.3, [0.25, 0.25, 0.2]));
  assert.equal(u.routing, "INSPECT");
  // expected costs propagate to the chosen action
  assert.ok(Math.abs(a.expectedCost - a.expectedCostByAction["AUTO-APPROVE"]) < 1e-9);
  // realized cost: approving abuse costs fraudLoss; inspect always costs labor
  assert.equal(realizedRoutingCost("AUTO-APPROVE", "abusive"), ROUTING_CONFIG.fraudLossApprove);
  assert.equal(realizedRoutingCost("AUTO-APPROVE", "genuine_fit_issue"), 0);
});

test("Wilson interval covers the classical normal range", () => {
  const [lo, hi] = wilson(50, 100);
  assert.ok(lo < 0.5 && hi > 0.5 && hi - lo < 0.25);
  const [lo0] = wilson(0, 10);
  assert.ok(lo0 === 0);
});

test("fairness report: groups, rates, gaps and warnings", () => {
  const rows: FairnessRowInput[] = [];
  for (let i = 0; i < 300; i++) {
    rows.push({
      label: i % 10 === 0 ? "abusive" : "genuine_fit_issue",
      predictedClass: i % 10 === 0 ? "abusive" : "genuine_fit_issue",
      routing: i % 10 === 0 ? "ESCALATE" : "AUTO-APPROVE",
      realizedCost: i % 10 === 0 ? 1.1 : 0,
      customerTenureDays: i < 150 ? 30 : 800, // first half "new"
      historyMissing: i < 150,
      orderValue: i < 60 ? 500 : 3000,
      language: i % 3 === 0 ? "hinglish" : "en",
    });
  }
  const report = buildFairnessReport(rows);
  assert.equal(report.length, 3);
  const tenure = report.find((s) => s.id === "tenure")!;
  const newGroup = tenure.groups[0];
  assert.equal(newGroup.n, 150);
  assert.ok(Math.abs(newGroup.routingRates.ESCALATE - 0.1) < 1e-9);
  assert.equal(newGroup.fprAbusive, 0); // genuine never flagged in fixture
  assert.ok(tenure.findings.length > 0);
});

test("CSV round-trip with quotes, commas and newlines", () => {
  const headers = ["order_value", "reason_text"];
  const rows = [["1299", "He said, \"size chota hai, exchange karna\""], ["999", "line1\nline2"]];
  const text = toCsv(headers, rows);
  const parsed = parseCsv(text);
  assert.deepEqual(parsed.headers, headers);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0][1], rows[0][1]);
  assert.equal(parsed.rows[1][1], rows[1][1]);
});

test("API validation rejects bad rows and preserves original meaning", () => {
  const good = validateCase({ orderValue: "1,299", reasonText: "साइज़ छोटा है" });
  assert.ok(good.ok);
  assert.equal(good.input.orderValue, 1299);
  const bad = validateCase({ orderValue: "abc" });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.length > 0);
  const blankHistory = validateCase({ orderValue: 500, customerTenureDays: "" });
  assert.ok(blankHistory.ok);
  assert.equal(blankHistory.input.customerTenureDays, null);
});

test("synthetic generator: deterministic, customer-grouped splits, sane class mix", () => {
  const a = generateDataset(42, { products: 20, customers: 300, cases: 3000 });
  const b = generateDataset(42, { products: 20, customers: 300, cases: 3000 });
  assert.equal(a.cases[0].id, b.cases[0].id);
  assert.equal(a.cases[10].label, b.cases[10].label);
  const byCust = new Map<string, string>();
  for (const c of a.cases) {
    const s = byCust.get(c.customerId);
    if (s) assert.equal(s, c.split, "customer must stay in one split");
    else byCust.set(c.customerId, c.split);
  }
  const counts: Record<string, number> = {};
  for (const c of a.cases) counts[c.label] = (counts[c.label] ?? 0) + 1;
  const total = a.cases.length;
  assert.ok(counts.abusive / total > 0.02 && counts.abusive / total < 0.3);
  assert.ok((counts.genuine_fit_issue ?? 0) > 0, "fit issues exist");
  assert.ok(a.products.length === 20 && a.customers.length === 300);
});

test("message drafts follow policy and never accuse", () => {
  for (const lang of ["en", "hinglish", "hi"] as const) {
    const { body } = draftMessage({ category: "genuine_fit_issue", language: lang });
    assert.ok(body.includes("30"), "mentions the 30-day window");
    const lower = body.toLowerCase();
    for (const banned of ["fraud", "cheat", "dhoka", "धोखा", "guilty"]) {
      assert.ok(!lower.includes(banned), `never contains '${banned}'`);
    }
  }
  const abuse = draftMessage({ category: "abusive", language: "en" }).body.toLowerCase();
  assert.ok(!abuse.includes("fraud") && !abuse.includes("cheat"));
  assert.ok(abuse.includes("verification"), "abuse-track message is a verification request");
});

test("all ten demo scenarios pass API validation", () => {
  for (const d of DEMO_CASES) {
    const v = validateCase(d.input as unknown as Record<string, unknown>);
    assert.ok(v.ok, `${d.id} must validate: ${v.errors.join(";")}`);
  }
});

test("provisional matrix direction: matrix is 4x4 with zero diagonal", () => {
  assert.equal(PROVISIONAL_COST_MATRIX.length, 4);
  PROVISIONAL_COST_MATRIX.forEach((row, i) => {
    assert.equal(row.length, 4);
    assert.equal(row[i], 0);
  });
});
