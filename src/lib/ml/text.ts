// Multilingual text engine: tokenization (incl. Devanagari), language detection,
// and TF-IDF vectorization over word uni/bi-grams + character n-grams.
// Hinglish and transliterated Hindi are first-class, legitimate inputs — detection
// is used for service quality (language-appropriate replies) and fairness auditing,
// NEVER as a fraud signal by policy.

const TOKEN_RE = /[\p{L}\p{N}]+/gu;
const DEVANAGARI_RE = /[\u0900-\u097F]/u;

/** Strong Hinglish / romanized-Hindi function words and complaint stems. */
const HINGLISH_MARKERS = new Set([
  "hai", "nahi", "nahin", "hain", "karna", "karna", "karo", "karo", "chahiye", "mujhe",
  "mera", "meri", "mere", "aaya", "aya", "gaya", "gayi", "liye", "mein", "se", "ka",
  "ki", "ke", "ko", "par", "tha", "thi", "kiya", "kar", "raha", "bahut", "thoda",
  "bilkul", "accha", "theek", "kharab", "galat", "chota", "chhota", "bada", "choti",
  "badi", "kapda", "silai", "rita", "paisa", "wapas", "badal", "badlo", "badalna",
  "exchange", "refund", "mast", "bekar", "fata", "phata", "tuta", "toota", "mitha",
  "size", "color", "colour", "item", "product", "order",
  // strong-only markers below handled by strong set
]);
const STRONG_HINGLISH = new Set([
  "hai", "nahi", "nahin", "hain", "karna", "chahiye", "mujhe", "mera", "meri", "aaya",
  "aya", "gaya", "gayi", "kharab", "galat", "chota", "chhota", "bada", "kapda", "silai",
  "wapas", "badal", "badlo", "badalna", "bekar", "phata", "fata", "tuta", "toota", "paisa",
  "theek", "bilkul", "bahut", "thoda", "liye",
]);

export type DetectedLanguage = "en" | "hinglish" | "hi" | "missing";

export function detectLanguage(text: string): DetectedLanguage {
  if (!text || text.trim().length === 0) return "missing";
  if (DEVANAGARI_RE.test(text)) return "hi";
  const tokens = tokenize(text);
  let strong = 0;
  for (const t of tokens) if (STRONG_HINGLISH.has(t)) strong++;
  if (strong >= 1) return "hinglish";
  return "en";
}

export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const out: string[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(lower)) !== null) out.push(m[0]);
  return out;
}

function charNgrams(token: string): string[] {
  // Only for alphabetic tokens of length >= 4; bounded contribution
  if (token.length < 4 || token.length > 14) return [];
  const padded = `<${token}>`;
  const grams: string[] = [];
  for (const n of [3, 4]) {
    for (let i = 0; i + n <= padded.length && grams.length < 8; i++) {
      grams.push(padded.slice(i, i + n));
    }
  }
  return grams;
}

/** Feature extractor: word unigrams + bigrams + bounded char n-grams. */
export function extractFeats(text: string): string[] {
  const toks = tokenize(text);
  const feats: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    feats.push(`w:${t}`);
    if (i + 1 < toks.length) feats.push(`b:${t}_${toks[i + 1]}`);
    for (const g of charNgrams(t)) feats.push(`c:${g}`);
  }
  return feats;
}

export interface TextVectorizer {
  vocab: string[]; // feature string -> index via map
  index: Record<string, number>;
  idf: number[];
  docCount: number;
}

export function buildVocabulary(
  docs: string[],
  opts: { maxVocab: number; minDf: number },
): TextVectorizer {
  const df = new Map<string, number>();
  let docCount = 0;
  for (const d of docs) {
    docCount++;
    const seen = new Set<string>();
    for (const f of extractFeats(d)) {
      if (!seen.has(f)) {
        seen.add(f);
        df.set(f, (df.get(f) ?? 0) + 1);
      }
    }
  }
  const candidates = [...df.entries()]
    .filter(([, c]) => c >= opts.minDf)
    .sort((a, b) => b[1] - a[1])
    .slice(0, opts.maxVocab)
    .map(([f]) => f);
  candidates.sort(); // stable deterministic order
  const index: Record<string, number> = {};
  candidates.forEach((f, i) => (index[f] = i));
  // idf = ln((1+N)/(1+df)) + 1  (smoothed)
  const idf = candidates.map((f) => Math.log((1 + docCount) / (1 + (df.get(f) ?? 0))) + 1);
  return { vocab: candidates, index, idf, docCount };
}

export interface SparseVec {
  idx: number[];
  val: number[];
}

/** Sublinear TF, IDF from training corpus, L2-normalized. */
export function vectorize(text: string, vec: TextVectorizer): SparseVec {
  const counts = new Map<number, number>();
  for (const f of extractFeats(text)) {
    const i = vec.index[f];
    if (i !== undefined) counts.set(i, (counts.get(i) ?? 0) + 1);
  }
  let norm = 0;
  const idx: number[] = [];
  const val: number[] = [];
  for (const [i, c] of counts) {
    const tf = 1 + Math.log(c);
    const w = tf * vec.idf[i];
    idx.push(i);
    val.push(w);
    norm += w * w;
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < val.length; i++) val[i] /= norm;
  return { idx, val };
}

/** Top tokens by contribution weight_i * x_i for a given class of a linear model. */
export function topContributions(
  vec: TextVectorizer,
  weights: Float64Array, // nFeat * nClass (row-major by feature)
  nClass: number,
  classIdx: number,
  sv: SparseVec,
  k: number,
): { feature: string; contribution: number }[] {
  const scored = sv.idx.map((i, j) => ({
    feature: vec.vocab[i],
    contribution: weights[i * nClass + classIdx] * sv.val[j],
  }));
  scored.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return scored.slice(0, k);
}

/** Human-readable rendering of an internal feature id. */
export function renderFeature(f: string): string {
  if (f.startsWith("w:")) return `"${f.slice(2)}"`;
  if (f.startsWith("b:")) return `phrase "${f.slice(2).replace(/_/g, " ")}"`;
  if (f.startsWith("c:")) return `character pattern "${f.slice(2).replace(/</g, "").replace(/>/g, "")}"`;
  return f;
}
