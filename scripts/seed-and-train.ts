/**
 * ReturnGuard AI — reproducible seed + train + evaluate pipeline.
 *
 *   npx tsx scripts/seed-and-train.ts
 *
 * Deterministic (seed 42). Generates the labeled synthetic demo dataset
 * (official data absent — see PROJECT_STATUS.md), trains three modeling
 * approaches (structured / text / fused), calibrates probabilities on the
 * validation split, evaluates with the PROVISIONAL cost matrix on the test
 * split, audits fairness, persists everything to Postgres, and writes the
 * deployable artifact to artifacts/model.json.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { db } from "../src/db";
import { customers, modelRuns, products, returnCases } from "../src/db/schema";
import { sql } from "drizzle-orm";
import { generateDataset, type SynthCase } from "../src/lib/ml/synth";
import { buildVocabulary, vectorize, type SparseVec } from "../src/lib/ml/text";
import {
  applyTemperature,
  fitTemperature,
  logitsDense,
  logitsSparse,
  softmax,
  trainSoftmaxDense,
  trainSoftmaxSparse,
} from "../src/lib/ml/softmax";
import { evaluate, routeCase, realizedRoutingCost, withRouting, type EvalReport } from "../src/lib/ml/evaluator";
import { buildFairnessReport, type FairnessRowInput } from "../src/lib/ml/fairness";
import {
  DATA_SOURCE_LABEL,
  MODEL_VERSION,
  PROVISIONAL_COST_MATRIX,
  ROUTING_CONFIG,
  CLASSES,
  type ReturnClass,
} from "../src/lib/ml/labels";
import { numericRow, structuredVector, type FeatureSchema, type ModelArtifact } from "../src/lib/ml/pipeline";

const SEED = 42;
const toInput = (c: SynthCase) => ({
  orderValue: c.orderValue,
  quantity: c.quantity,
  discountPct: c.discountPct,
  deliveryDays: c.deliveryDays,
  daysSinceDelivery: c.daysSinceDelivery,
  paymentMethod: c.paymentMethod,
  category: c.skuCategory,
  region: c.region,
  customerTenureDays: c.historyMissing ? null : c.customerTenureDays,
  priorOrders12m: c.historyMissing ? null : c.priorOrders12m,
  priorReturns12m: c.historyMissing ? null : c.priorReturns12m,
  accountOrdersLifetime: c.historyMissing ? null : c.accountOrdersLifetime,
  reasonText: c.reasonText,
});
const classIdx = (l: ReturnClass) => CLASSES.indexOf(l);

async function main() {
  const t0 = Date.now();
  console.log("== ReturnGuard AI :: seed & train (seed=42) ==");

  // 1) Generate
  const { products: prods, customers: custs, cases } = generateDataset(SEED, { products: 150, customers: 9000, cases: 63000 });
  console.log(`dataset: ${cases.length} cases, ${custs.length} customers, ${prods.length} products`);

  const train = cases.filter((c) => c.split === "train");
  const val = cases.filter((c) => c.split === "val");
  const test = cases.filter((c) => c.split === "test");
  console.log(`splits (customer-grouped): train=${train.length} val=${val.length} test=${test.length}`);

  // 2) Feature schema from TRAIN only (leakage control)
  const trainNums = train.map((c) => numericRow(toInput(c)));
  const nNum = trainNums[0].length;
  const means = new Array<number>(nNum).fill(0);
  for (const row of trainNums) for (let j = 0; j < nNum; j++) means[j] += row[j];
  for (let j = 0; j < nNum; j++) means[j] /= trainNums.length;
  const stds = new Array<number>(nNum).fill(0);
  for (const row of trainNums) for (let j = 0; j < nNum; j++) stds[j] += (row[j] - means[j]) ** 2;
  for (let j = 0; j < nNum; j++) stds[j] = Math.max(1e-6, Math.sqrt(stds[j] / trainNums.length));
  const uniq = (xs: string[]) => [...new Set(xs)].sort();
  const schema: FeatureSchema = {
    means,
    stds,
    categoricalValues: {
      paymentMethod: uniq(train.map((c) => c.paymentMethod)),
      category: uniq(train.map((c) => c.skuCategory)),
      region: uniq(train.map((c) => c.region)),
    },
  };
  const structDim = nNum + Object.values(schema.categoricalValues).reduce((s, v) => s + v.length, 0);

  // 3) Baselines on TEST (same provisional matrix)
  const rulesKeywords: [RegExp, ReturnClass][] = [
    [/khali|empty|never arrived|pehna|wore|photo shoot|shaadi mein|used it/i, "abusive"],
    [/zip|stitch|silai|seam|tor(e|n)|defect|kharab|phat|tuta|button|fading|hole|broke|सिलाई|ज़िप|फट|बटन|रंग/i, "genuine_quality_issue"],
    [/tight|loose|size|chota|bada|fit|length|साइज़|टाइट|ढीली/i, "genuine_fit_issue"],
    [/wrong|different|galat|गलत|colour|color/i, "genuine_wrong_item"],
  ];
  const rulesPred = (c: SynthCase): number => {
    for (const [re, cls] of rulesKeywords) if (re.test(c.reasonText)) return classIdx(cls);
    return classIdx("genuine_fit_issue");
  };
  const testY = test.map((c) => classIdx(c.label));
  const approveAllReport = evaluate(testY, null, test.map(() => classIdx("genuine_fit_issue")));
  const rulesReport = evaluate(testY, null, test.map(rulesPred));

  // 4) Structured model
  console.log("training structured model…");
  const structTrain = train.map((c) => structuredVector(toInput(c), schema));
  const structVal = val.map((c) => structuredVector(toInput(c), schema));
  const structTest = test.map((c) => structuredVector(toInput(c), schema));
  const structY = train.map((c) => classIdx(c.label));
  const struct = trainSoftmaxDense(structTrain, structY, {
    nFeat: structTrain[0].length, nClass: 4, epochs: 60, lr: 0.25, l2: 1e-5, seed: SEED,
    onEpoch: (e, l) => e % 15 === 0 && console.log(`  epoch ${e} loss=${l.toFixed(4)}`),
  });

  // 5) Text model
  console.log("building text vocabulary (train only)…");
  const vec = buildVocabulary(train.map((c) => c.reasonText), { maxVocab: 22000, minDf: 3 });
  console.log(`  vocab=${vec.vocab.length}`);
  const textTrain = train.map((c) => vectorize(c.reasonText, vec));
  console.log("training text model…");
  const text = trainSoftmaxSparse(textTrain, structY, {
    nFeat: vec.vocab.length, nClass: 4, epochs: 6, lr: 0.6, l2: 1e-6, seed: SEED + 1,
    onEpoch: (e, l) => console.log(`  epoch ${e} loss=${l.toFixed(4)}`),
  });
  const textVal = val.map((c) => vectorize(c.reasonText, vec));
  const textTest = test.map((c) => vectorize(c.reasonText, vec));

  // 6) Temperature calibration on VALIDATION
  const structValProbs = structVal.map((x) => softmax(logitsDense(struct.W, struct.b, x, 4)));
  const textValProbs = textVal.map((v: SparseVec) => softmax(logitsSparse(text.W, text.b, v, 4)));
  const valY = val.map((c) => classIdx(c.label));
  const structT = fitTemperature(structValProbs, valY);
  const textT = fitTemperature(textValProbs, valY);
  const calSVal = structValProbs.map((p) => applyTemperature(p, structT));
  const calTVal = textValProbs.map((p) => applyTemperature(p, textT));
  console.log(`temperatures: structured=${structT} text=${textT}`);

  // 7) Fused stacker trained on VALIDATION predictions
  console.log("training fusion layer on validation outputs…");
  const stackVal = calSVal.map((p, i) => [...p, ...calTVal[i]]);
  const fusion = trainSoftmaxDense(stackVal, valY, {
    nFeat: 8, nClass: 4, epochs: 220, lr: 0.5, l2: 1e-4, seed: SEED + 2,
  });
  const fusedValRaw = stackVal.map((x) => softmax(logitsDense(fusion.W, fusion.b, x, 4)));
  const fusionT = fitTemperature(fusedValRaw, valY);
  console.log(`fusion temperature=${fusionT}`);

  // 8) Evaluate all approaches on TEST (untouched until now)
  const structTestProbs = structTest.map((x) => applyTemperature(softmax(logitsDense(struct.W, struct.b, x, 4)), structT));
  const textTestProbs = textTest.map((v: SparseVec) => applyTemperature(softmax(logitsSparse(text.W, text.b, v, 4)), textT));
  const fusedTestProbs = structTestProbs.map((p, i) =>
    applyTemperature(softmax(logitsDense(fusion.W, fusion.b, [...p, ...textTestProbs[i]], 4)), fusionT),
  );
  const mStructured = evaluate(testY, structTestProbs, null);
  const mText = evaluate(testY, textTestProbs, null);
  const mFused = withRouting(evaluate(testY, fusedTestProbs, null), testY, fusedTestProbs);
  // approve-all policy: every case auto-approved; realized cost = abuse incidence
  const approveAllRoutingCost =
    test.filter((c) => c.label === "abusive").length / Math.max(1, test.length);
  const mApproveAll: EvalReport = {
    ...approveAllReport,
    routing: {
      distribution: { "AUTO-APPROVE": test.length, INSPECT: 0, ESCALATE: 0 },
      meanRealizedRoutingCost: approveAllRoutingCost,
      reviewWorkloadPct: 0,
    },
  };
  const metrics: Record<string, EvalReport> = { structured: mStructured, text: mText, fused: mFused };
  const baselines: Record<string, EvalReport> = { "approve-all": mApproveAll, "keyword-rules": rulesReport };

  console.log("\n== TEST RESULTS (provisional cost matrix, lower=cost better) ==");
  for (const [k, r] of [...Object.entries(baselines), ...Object.entries(metrics)]) {
    console.log(
      `  ${k.padEnd(14)} cost=${r.meanCost.toFixed(4)}  acc=${(r.accuracy * 100).toFixed(1)}%  macroF1=${(r.macroF1 * 100).toFixed(1)}%  brier=${r.brier?.toFixed(4) ?? "-"}`,
    );
  }

  // 9) Chronology robustness check on test (months 0-8 vs 9-11)
  const earlyIdx = test.map((c, i) => (c.monthIndex < 9 ? i : -1)).filter((i) => i >= 0);
  const lateIdx = test.map((c, i) => (c.monthIndex >= 9 ? i : -1)).filter((i) => i >= 0);
  const sub = (idxs: number[]) => evaluate(idxs.map((i) => testY[i]), idxs.map((i) => fusedTestProbs[i]), null);
  const chrono = {
    note: "Fused model cost on test cases split by calendar month (drift check, not re-trained).",
    earlyMeanCost: sub(earlyIdx).meanCost,
    lateMeanCost: sub(lateIdx).meanCost,
    earlyN: earlyIdx.length,
    lateN: lateIdx.length,
  };

  // 10) Persist predictions onto every case (fused model) + fairness rows
  console.log("scoring all 63k cases with fused model for persistence…");
  const allStruct = cases.map((c) => structuredVector(toInput(c), schema));
  const fairnessRows: FairnessRowInput[] = [];
  const fusedAll: { probs: Record<ReturnClass, number>; pred: ReturnClass; routing: string; cost: number; conf: number }[] = [];
  for (let i = 0; i < cases.length; i++) {
    const sp = applyTemperature(softmax(logitsDense(struct.W, struct.b, allStruct[i], 4)), structT);
    const sv = vectorize(cases[i].reasonText, vec);
    const tp = applyTemperature(softmax(logitsSparse(text.W, text.b, sv, 4)), textT);
    const fp = applyTemperature(softmax(logitsDense(fusion.W, fusion.b, [...sp, ...tp], 4)), fusionT);
    const probs: Record<ReturnClass, number> = {
      abusive: Math.round(fp[0] * 10000) / 10000,
      genuine_quality_issue: Math.round(fp[1] * 10000) / 10000,
      genuine_fit_issue: Math.round(fp[2] * 10000) / 10000,
      genuine_wrong_item: Math.round(fp[3] * 10000) / 10000,
    };
    const pred = CLASSES[fp.indexOf(Math.max(...fp))];
    const dec = routeCase(probs, ROUTING_CONFIG);
    fusedAll.push({ probs, pred, routing: dec.routing, cost: dec.expectedCost, conf: Math.max(...fp) });
    if (cases[i].split === "test") {
      fairnessRows.push({
        label: cases[i].label,
        predictedClass: pred,
        routing: dec.routing,
        realizedCost: realizedRoutingCost(dec.routing, cases[i].label),
        customerTenureDays: cases[i].historyMissing ? null : cases[i].customerTenureDays,
        historyMissing: cases[i].historyMissing,
        orderValue: cases[i].orderValue,
        language: cases[i].detectedLanguage,
      });
    }
  }
  const fairness = buildFairnessReport(fairnessRows);

  // 11) Write artifact
  const roundArr = (a: Float64Array | number[], dp = 100000) =>
    Array.from(a, (v) => Math.round(v * dp) / dp);
  const perClass: Record<string, number> = {};
  const langCount: Record<string, number> = {};
  for (const c of cases) {
    perClass[c.label] = (perClass[c.label] ?? 0) + 1;
    langCount[c.detectedLanguage] = (langCount[c.detectedLanguage] ?? 0) + 1;
  }
  const artifact: ModelArtifact = {
    version: MODEL_VERSION,
    kind: "fused",
    seed: SEED,
    dataSource: DATA_SOURCE_LABEL,
    trainedAt: new Date().toISOString(),
    provisionalEvaluation: true,
    classes: [...CLASSES],
    schema,
    structured: { weights: roundArr(struct.W), bias: roundArr(struct.b), temperature: structT },
    textModel: {
      vocab: vec.vocab,
      idf: vec.idf.map((v) => Math.round(v * 1e6) / 1e6),
      docCount: vec.docCount,
      weights: roundArr(text.W),
      bias: roundArr(text.b),
      temperature: textT,
    },
    fusion: { weights: roundArr(fusion.W), bias: roundArr(fusion.b), temperature: fusionT },
    costMatrix: PROVISIONAL_COST_MATRIX,
    routingConfig: ROUTING_CONFIG,
    metrics,
    baselines,
    chronologyCheck: chrono,
    splitStrategy:
      "Customer-grouped stratified split 70/15/15 (train/val/test). Every customer appears in exactly one split — no identity leakage. Preprocessing fitted on train only; calibration and fusion fitted on validation only; all reported metrics computed on the untouched test split.",
    fairness,
    dataset: {
      total: cases.length,
      perClass,
      splits: { train: train.length, val: val.length, test: test.length },
      languages: langCount,
      customers: custs.length,
      products: prods.length,
    },
  };
  fs.mkdirSync(path.join(process.cwd(), "artifacts"), { recursive: true });
  fs.writeFileSync(
    path.join(process.cwd(), "artifacts", "model.json"),
    JSON.stringify(artifact),
  );
  const mb = (fs.statSync(path.join(process.cwd(), "artifacts", "model.json")).size / 1e6).toFixed(1);
  console.log(`artifact written (${mb} MB)`);

  // 12) Persist to Postgres
  console.log("writing to Postgres…");
  await db.execute(sql`TRUNCATE TABLE return_cases, review_actions, model_runs, customers, products, message_drafts RESTART IDENTITY`);
  await db.insert(products).values(
    prods.map((p) => ({
      id: p.id, name: p.name, category: p.category, priceInr: p.priceInr,
      fitNotes: p.fitNotes, sizeChart: p.sizeChart, qualityNotes: p.qualityNotes,
    })),
  );
  const CHUNK = 800;
  for (let i = 0; i < custs.length; i += CHUNK) {
    await db.insert(customers).values(
      custs.slice(i, i + CHUNK).map((c) => ({
        id: c.id, region: c.region, tenureDays: c.tenureDays,
        lifetimeOrders: c.lifetimeOrders, preferredLanguage: c.preferredLanguage,
      })),
    );
  }
  for (let i = 0; i < cases.length; i += CHUNK) {
    const rows = cases.slice(i, i + CHUNK).map((c, k) => {
      const f = fusedAll[i + k];
      return {
        id: c.id, customerId: c.customerId, productId: c.productId, skuCategory: c.skuCategory,
        orderValue: c.orderValue, quantity: c.quantity, discountPct: c.discountPct,
        deliveryDays: c.deliveryDays, daysSinceDelivery: c.daysSinceDelivery,
        paymentMethod: c.paymentMethod, region: c.region,
        customerTenureDays: c.historyMissing ? null : c.customerTenureDays,
        priorOrders12m: c.historyMissing ? null : c.priorOrders12m,
        priorReturns12m: c.historyMissing ? null : c.priorReturns12m,
        accountOrdersLifetime: c.historyMissing ? null : c.accountOrdersLifetime,
        historyMissing: c.historyMissing ? 1 : 0,
        reasonText: c.reasonText, detectedLanguage: c.detectedLanguage,
        label: c.label, source: DATA_SOURCE_LABEL, split: c.split, monthIndex: c.monthIndex,
        probs: f.probs, predictedClass: f.pred, routing: f.routing,
        expectedCost: f.cost, calibratedConfidence: f.conf, modelVersion: MODEL_VERSION,
      };
    });
    await db.insert(returnCases).values(rows);
    if ((i / CHUNK) % 15 === 0) console.log(`  inserted ${Math.min(i + CHUNK, cases.length)}/${cases.length}`);
  }
  for (const [kind, m] of [...Object.entries(baselines), ...Object.entries(metrics)]) {
    await db.insert(modelRuns).values({ version: MODEL_VERSION, kind, dataSource: DATA_SOURCE_LABEL, metrics: m });
  }
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
