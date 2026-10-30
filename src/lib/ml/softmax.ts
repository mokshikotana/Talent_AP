// Multinomial logistic regression (softmax) with SGD — dense and sparse variants —
// plus temperature scaling for probability calibration. Pure TypeScript, deterministic.

import type { SparseVec } from "./text";

export function softmax(logits: number[]): number[] {
  let max = -Infinity;
  for (const v of logits) if (v > max) max = v;
  let sum = 0;
  const exps = logits.map((v) => {
    const e = Math.exp(v - max);
    sum += e;
    return e;
  });
  return exps.map((e) => e / sum);
}

export function logitsDense(W: Float64Array, b: Float64Array, x: number[], nClass: number): number[] {
  const out = Array.from(b);
  for (let f = 0; f < x.length; f++) {
    const xv = x[f];
    if (xv === 0) continue;
    const base = f * nClass;
    for (let c = 0; c < nClass; c++) out[c] += W[base + c] * xv;
  }
  return out;
}

export function logitsSparse(W: Float64Array, b: Float64Array, sv: SparseVec, nClass: number): number[] {
  const out = Array.from(b);
  for (let j = 0; j < sv.idx.length; j++) {
    const base = sv.idx[j] * nClass;
    const v = sv.val[j];
    for (let c = 0; c < nClass; c++) out[c] += W[base + c] * v;
  }
  return out;
}

/** p_i^(1/T) normalized == softmax(logits / T) up to numerical equivalence. */
export function applyTemperature(p: number[], T: number): number[] {
  if (Math.abs(T - 1) < 1e-9) return p.slice();
  const inv = 1 / T;
  let sum = 0;
  const q = p.map((pi) => {
    const v = Math.pow(Math.max(pi, 1e-12), inv);
    sum += v;
    return v;
  });
  return q.map((v) => v / sum);
}

/** Grid-search the temperature that minimizes validation NLL. */
export function fitTemperature(probs: number[][], ys: number[]): number {
  let bestT = 1;
  let bestNll = Infinity;
  for (let T = 0.5; T <= 4.0001; T += 0.1) {
    let nll = 0;
    for (let i = 0; i < probs.length; i++) {
      const q = applyTemperature(probs[i], T);
      nll += -Math.log(Math.max(q[ys[i]], 1e-12));
    }
    if (nll < bestNll) {
      bestNll = nll;
      bestT = T;
    }
  }
  return Math.round(bestT * 100) / 100;
}

interface TrainOpts {
  nFeat: number;
  nClass: number;
  epochs: number;
  lr: number;
  l2: number;
  seed: number;
  onEpoch?: (epoch: number, loss: number) => void;
}

function shuffledOrder(n: number, seed: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  let s = seed >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

export function trainSoftmaxSparse(docs: SparseVec[], ys: number[], opts: TrainOpts) {
  const W = new Float64Array(opts.nFeat * opts.nClass);
  const b = new Float64Array(opts.nClass);
  const n = docs.length;
  for (let epoch = 0; epoch < opts.epochs; epoch++) {
    const lr = opts.lr / (1 + epoch * 0.9);
    const order = shuffledOrder(n, opts.seed + epoch * 7919);
    let loss = 0;
    for (const oi of order) {
      const sv = docs[oi];
      const y = ys[oi];
      const probs = softmax(logitsSparse(W, b, sv, opts.nClass));
      loss += -Math.log(Math.max(probs[y], 1e-12));
      for (let c = 0; c < opts.nClass; c++) {
        const g = probs[c] - (c === y ? 1 : 0);
        if (g === 0) continue;
        b[c] -= lr * g;
        for (let j = 0; j < sv.idx.length; j++) {
          const fi = sv.idx[j] * opts.nClass + c;
          W[fi] -= lr * (g * sv.val[j] + opts.l2 * W[fi]);
        }
      }
    }
    opts.onEpoch?.(epoch, loss / n);
  }
  return { W, b };
}

export function trainSoftmaxDense(xs: number[][], ys: number[], opts: TrainOpts) {
  const W = new Float64Array(opts.nFeat * opts.nClass);
  const b = new Float64Array(opts.nClass);
  const n = xs.length;
  for (let epoch = 0; epoch < opts.epochs; epoch++) {
    const lr = opts.lr / (1 + epoch * 0.9);
    const order = shuffledOrder(n, opts.seed + epoch * 104729);
    let loss = 0;
    for (const oi of order) {
      const x = xs[oi];
      const y = ys[oi];
      const probs = softmax(logitsDense(W, b, x, opts.nClass));
      loss += -Math.log(Math.max(probs[y], 1e-12));
      for (let c = 0; c < opts.nClass; c++) {
        const g = probs[c] - (c === y ? 1 : 0);
        if (g === 0) continue;
        b[c] -= lr * g;
        for (let f = 0; f < x.length; f++) {
          W[f * opts.nClass + c] -= lr * (g * x[f] + opts.l2 * W[f * opts.nClass + c]);
        }
      }
    }
    opts.onEpoch?.(epoch, loss / n);
  }
  return { W, b };
}

export function nll(probs: number[][], ys: number[]): number {
  let s = 0;
  for (let i = 0; i < probs.length; i++) s += -Math.log(Math.max(probs[i][ys[i]], 1e-12));
  return s / probs.length;
}
