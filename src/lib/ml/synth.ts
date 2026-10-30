// Synthetic demonstration dataset generator (CLEARLY LABELED, seed=42).
// The official competition dataset is NOT present in this repository
// (PROJECT_STATUS.md — availability class C). This generator produces a
// realistic, replaceable stand-in: ~63k return requests with structured order
// features, messy multilingual reasons (English / Hinglish / Devanagari),
// a product catalogue with size charts, and the four official class labels.
// Class labels are generated from latent propensities + Gumbel noise so the
// classes are learnable but NOT linearly separable — FP/FN are expected.

import { Rng } from "./rng";
import type { ReturnClass } from "./labels";

export interface SizeRow {
  size: string;
  chest_in?: number;
  waist_in?: number;
  length_in?: number;
  uk?: number;
  foot_cm?: number;
}

export interface SynthProduct {
  id: string;
  name: string;
  category: string;
  priceInr: number;
  fitBias: -1 | 0 | 1; // apparel: runs-small / true / runs-large
  defectRate: number;
  sizeChart: SizeRow[];
  fitNotes: string;
  qualityNotes: string;
}

export interface SynthCustomer {
  id: string;
  region: string;
  tenureDays: number;
  lifetimeOrders: number;
  preferredLanguage: "en" | "hinglish" | "hi";
  fraudPropensity: number; // latent, 0..1
  returnPropensity: number; // latent, 0..1
  split: "train" | "val" | "test";
}

export interface SynthCase {
  id: string;
  customerId: string;
  productId: string;
  skuCategory: string;
  orderValue: number;
  quantity: number;
  discountPct: number;
  deliveryDays: number;
  daysSinceDelivery: number;
  paymentMethod: string;
  region: string;
  customerTenureDays: number;
  priorOrders12m: number;
  priorReturns12m: number;
  accountOrdersLifetime: number;
  historyMissing: boolean;
  reasonText: string;
  detectedLanguage: string;
  label: ReturnClass;
  split: "train" | "val" | "test";
  monthIndex: number;
}

const REGIONS = ["Delhi NCR", "Mumbai", "Bengaluru", "Hyderabad", "Chennai", "Kolkata", "Pune", "Jaipur"];
const PAYMENTS = ["card", "upi", "cod", "wallet"];

const APPAREL = ["Jeans", "T-Shirts", "Shirts", "Dresses", "Kurtas", "Jackets", "Activewear"];
const FOOTWEAR = ["Footwear"];
const NON_FIT = ["Home & Living", "Accessories"];
const CATEGORIES = [...APPAREL, ...FOOTWEAR, ...NON_FIT];

const BRANDS = [
  "Aster", "Meridian", "Kavya", "Nimbus", "Velvetline", "Urban Thread", "Northloom",
  "Zephyr", "Indigo Works", "Casa Verde", "Auric", "Saanjh", "TruFit", "Bold Atlas", "Riva",
];
const STYLEWORDS: Record<string, string[]> = {
  Jeans: ["Slim-Fit Jeans", "Stretch Denims", "Relaxed Jeans", "High-Rise Jeans", "Straight-Cut Denims"],
  "T-Shirts": ["Cotton Tee", "Oversized Tee", "Polo Tee", "Graphic Tee", "Everyday Crew Tee"],
  Shirts: ["Linen Shirt", "Formal Shirt", "Oxford Shirt", "Casual Check Shirt"],
  Dresses: ["A-Line Dress", "Midi Dress", "Wrap Dress", "Summer Dress"],
  Kurtas: ["Cotton Kurta", "Festive Kurta", "Straight Kurta", "Embroidered Kurta"],
  Jackets: ["Bomber Jacket", "Denim Jacket", "Quilted Jacket", "Windcheater"],
  Activewear: ["Running Tights", "Training Shorts", "Yoga Pants", "Sports Tee"],
  Footwear: ["Knit Sneakers", "Leather Loafers", "Running Shoes", "Canvas Slip-Ons"],
  "Home & Living": ["Bedsheet Set", "Cushion Cover", "Ceramic Mug Set", "Cotton Throw"],
  Accessories: ["Wireless Earbuds", "Phone Case", "Smartwatch Strap", "Travel Pouch"],
};

const PARTS = ["waist", "chest", "shoulders", "arms", "hips", "length", "bust", "sleeves"];
const FOOT_PARTS = ["toe box", "width", "heel", "instep"];

export function generateProducts(rng: Rng, count: number): SynthProduct[] {
  const products: SynthProduct[] = [];
  for (let i = 0; i < count; i++) {
    const category = CATEGORIES[i % CATEGORIES.length];
    const brand = rng.pick(BRANDS);
    const style = rng.pick(STYLEWORDS[category]);
    const isFit = APPAREL.includes(category) || FOOTWEAR.includes(category);
    const fitBias: -1 | 0 | 1 = isFit
      ? rng.weighted([-1, 0, 1] as const, [0.3, 0.5, 0.2])
      : 0;
    // A small number of products are quality hotspots.
    const defectRate = rng.chance(0.08) ? rng.range(0.04, 0.07) : rng.range(0.004, 0.02);
    const priceInr =
      category === "Footwear"
        ? rng.int(900, 6500)
        : category === "Home & Living"
          ? rng.int(350, 3200)
          : category === "Accessories"
            ? rng.int(400, 4500)
            : rng.int(500, 5200);
    let sizeChart: SizeRow[] = [];
    if (category === "Jeans") {
      sizeChart = [28, 30, 32, 34, 36, 38, 40].map((w) => ({ size: `${w}`, waist_in: w, length_in: rng.pick([30, 32, 34]) }));
    } else if (APPAREL.includes(category)) {
      const sizes = ["XS", "S", "M", "L", "XL", "XXL"];
      sizeChart = sizes.map((s, k) => ({
        size: s,
        chest_in: 34 + k * 2,
        waist_in: 28 + k * 2,
        length_in: 25 + k,
      }));
    } else if (category === "Footwear") {
      sizeChart = [6, 7, 8, 9, 10, 11].map((uk) => ({ size: `UK ${uk}`, uk, foot_cm: 24 + (uk - 6) * 0.8 }));
    }
    const fitNotes =
      fitBias === -1
        ? "Pattern runs approximately one size small against the published chart."
        : fitBias === 1
          ? "Cut runs generous; many customers size down."
          : "True to size against the published chart.";
    const qualityNotes =
      defectRate > 0.04
        ? "Vendor QC flags elevated defect reports (stitching/zipper) for this batch."
        : "No anomaly in QC history.";
    products.push({
      id: `PR-${String(i + 1).padStart(4, "0")}`,
      name: `${brand} ${style}`,
      category,
      priceInr,
      fitBias,
      defectRate,
      sizeChart,
      fitNotes,
      qualityNotes,
    });
  }
  return products;
}

export function generateCustomers(rng: Rng, count: number): SynthCustomer[] {
  const customers: SynthCustomer[] = [];
  for (let i = 0; i < count; i++) {
    const tenureDays = Math.max(3, Math.round(rng.range(0, 1) ** 2 * 2800 + rng.int(3, 60)));
    const lifetimeOrders = Math.max(1, Math.round(rng.range(0, 1) ** 1.6 * 60) + (tenureDays > 365 ? rng.int(0, 12) : rng.int(0, 3)));
    // ~6% of accounts carry elevated abuse propensity; the rest near zero.
    const fraudPropensity = rng.chance(0.06) ? rng.range(0.45, 0.95) : rng.range(0, 0.12);
    const returnPropensity = Math.min(1, rng.range(0.02, 0.3) + fraudPropensity * 0.5);
    const preferredLanguage = rng.weighted(["en", "hinglish", "hi"] as const, [0.5, 0.35, 0.15]);
    const split = rng.weighted(["train", "val", "test"] as const, [0.7, 0.15, 0.15]);
    customers.push({
      id: `CU-${String(i + 1).padStart(6, "0")}`,
      region: rng.pick(REGIONS),
      tenureDays,
      lifetimeOrders,
      preferredLanguage,
      fraudPropensity: Math.round(fraudPropensity * 1000) / 1000,
      returnPropensity: Math.round(returnPropensity * 1000) / 1000,
      split,
    });
  }
  return customers;
}

// ---------------------------------------------------------------------------
// Multilingual reason templates. `shared` phrases appear across classes to keep
// the problem realistically confusable (uncertainty → INSPECT).
// ---------------------------------------------------------------------------

const SHARED_AMBIGUOUS = {
  en: ["Not as expected, want to return", "Product did not match what I had in mind", "Not happy with it"],
  hinglish: ["expectation ke hisaab se nahi hai", "pasand nahi aaya, return karna hai", "theek nahi laga mujhe"],
  hi: ["उम्मीद जैसा नहीं है", "पसंद नहीं आया, वापस करना है"],
};

const TPL: Record<ReturnClass, { en: string[]; hinglish: string[]; hi: string[] }> = {
  abusive: [
    {
      en: [
        "Wore it once for a wedding, now I want my money back",
        "Bought for a party, used it, returning now",
        "Got an empty box, item was missing",
        "Parcel had only paper inside, refund my money",
        "Used it for a function and clicked photos, no longer needed",
        "Item never arrived, empty packet delivered",
      ],
      hinglish: [
        "shaadi mein ek baar pehna tha, ab return karna hai",
        "party ke liye manga tha, use ho gaya, refund chahiye",
        "box khali aaya, item hi nahi tha",
        "parcel mein sirf kagaz tha, paisa wapas karo",
        "photo shoot ke liye liya tha, ab kaam nahi hai",
        "pehen ke photos liye, ab refund do",
      ],
      hi: [
        "शादी में एक बार पहना, अब वापस करना है",
        "पार्टी के लिए मंगाया था, इस्तेमाल हो गया",
        "खाली डिब्बा आया, सामान नहीं था",
        "पार्सल में कागज़ था, पैसे वापस चाहिए",
      ],
    },
  ][0],
  genuine_quality_issue: [
    {
      en: [
        "The seam on the {part} tore after the first wash",
        "Stitching is coming apart near the {part}",
        "Zip is broken, cannot close it properly",
        "Fabric has a hole and the colour is fading already",
        "Buttons fell off within two days, poor finishing",
        "Sole started peeling off, defective piece received",
        "Material tore at the seam, clearly a manufacturing defect",
      ],
      hinglish: [
        "pehli wash mein hi silai khul gayi hai",
        "kapda {part} se phat gaya hai",
        "zip kharab hai, band nahi hoti",
        "do din mein button nikal gaye, finishing bekar hai",
        "kapde ka colour ud raha hai aur ched bhi hai",
        "sole ukhad raha hai, defective piece mila",
        "stitching nikal gayi, quality bahut kharab hai",
      ],
      hi: [
        "पहली धुलाई में ही सिलाई खुल गई है",
        "कपड़ा फट गया है, मामूली इस्तेमाल में ही",
        "ज़िप ख़राब है, बंद नहीं होती",
        "दो दिन में बटन निकल गए",
        "रंग उड़ रहा है और कपड़े में छेद है",
        "सिलाई टूट गई है, मैन्युफैक्चरिंग डिफेक्ट है",
      ],
    },
  ][0],
  genuine_fit_issue: [
    {
      en: [
        "Too tight around the {part}, need a bigger size",
        "Size runs small, ordered my usual size",
        "Too loose around the {part}, fits like a size up",
        "The {part} is very snug, exchange for one size bigger",
        "Fits short in length, please exchange",
        "Size chart seems off for this one, too tight at the {part}",
      ],
      hinglish: [
        "size chota hai, exchange karna hai",
        "{part} se tight hai, ek size bada chahiye",
        "fitting loose hai, size chart sahi nahi lagta",
        "length choti hai, badalna hai",
        "usual size mangaya tha par bahut tight hai",
        "thoda tight hai {part} pe, bada size bhejo",
      ],
      hi: [
        "साइज़ छोटा है, बड़ा साइज़ चाहिए",
        "{part} से टाइट है, एक्सचेंज करना है",
        "फिटिंग ढीली है, साइज़ चार्ट सही नहीं है",
        "लंबाई कम है, बदलना है",
      ],
    },
  ][0],
  genuine_wrong_item: [
    {
      en: [
        "Received a different colour than what I ordered",
        "Wrong size delivered, ordered M got XL",
        "Completely different product in the box",
        "You sent the wrong item, invoice says something else",
        "Got a different style, not the one in the photo",
      ],
      hinglish: [
        "galat item aaya hai, jo order kiya woh nahi mila",
        "different colour aaya, order kuch aur tha",
        "M size manga tha, XL bhej diya",
        "photo mein kuch aur tha, mila kuch aur",
        "wrong product bheja hai, bill dekh lo",
      ],
      hi: [
        "गलत आइटम आया है",
        "ऑर्डर किया कुछ और था, आया कुछ और",
        "गलत रंग भेज दिया गया है",
        "गलत साइज़ आया है, मेरा साइज़ नहीं है",
      ],
    },
  ][0],
};

const CLOSERS: Record<string, string[]> = {
  en: ["Please process my return.", "Want a refund as per policy.", "Requesting pickup.", "Please help with return."],
  hinglish: ["return process karo please", "paisa wapas chahiye", "pickup karwa do", "exchange kar do"],
  hi: ["कृपया वापसी स्वीकार करें", "रिफंड चाहिए", "पिकअप करवा दीजिए"],
};

function fillSlots(rng: Rng, s: string, category: string): string {
  const partPool = category === "Footwear" ? FOOT_PARTS : PARTS;
  return s.replace("{part}", rng.pick(partPool));
}

function mutateTypos(rng: Rng, text: string): string {
  const toks = text.split(" ");
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.length > 5 && rng.chance(0.12) && /^[a-z]+$/i.test(t)) {
      const j = rng.int(1, t.length - 2);
      toks[i] = t.slice(0, j) + t.slice(j + 1);
    }
  }
  return toks.join(" ");
}

function makeReason(
  rng: Rng,
  label: ReturnClass,
  lang: "en" | "hinglish" | "hi",
  category: string,
): string {
  // ~30% of abusive cases mimic honest-sounding language (the structural
  // evidence must carry those); ~8% of genuine cases use ambiguous shared shells.
  if (label === "abusive" && rng.chance(0.3)) {
    return mutateTypos(rng, rng.pick(SHARED_AMBIGUOUS[lang]));
  }
  if (label !== "abusive" && rng.chance(0.08)) {
    const honest = rng.pick(TPL[label][lang]);
    return mutateTypos(rng, `${fillSlots(rng, rng.pick(SHARED_AMBIGUOUS[lang]), category)} — ${fillSlots(rng, honest, category)}`);
  }
  const base = fillSlots(rng, rng.pick(TPL[label][lang]), category);
  const closer = rng.chance(0.65) ? ` ${rng.pick(CLOSERS[lang])}` : "";
  return mutateTypos(rng, base + closer);
}

export function generateDataset(seed = 42, opts?: { products?: number; customers?: number; cases?: number }) {
  const nProducts = opts?.products ?? 150;
  const nCustomers = opts?.customers ?? 9000;
  const nCases = opts?.cases ?? 63000;
  const rng = new Rng(seed);

  const products = generateProducts(rng, nProducts);
  const customers = generateCustomers(rng, nCustomers);

  const cases: SynthCase[] = [];
  for (let i = 0; i < nCases; i++) {
    const cust = customers[rng.int(0, nCustomers - 1)];
    const prod = products[rng.int(0, nProducts - 1)];
    const quantity = rng.weighted([1, 2, 3] as const, [0.85, 0.12, 0.03]);
    const orderValue = Math.round(prod.priceInr * quantity * rng.range(0.96, 1.04) * 100) / 100;
    const discountPct = rng.weighted([0, 5, 10, 15, 20, 25, 40] as const, [0.4, 0.12, 0.16, 0.1, 0.1, 0.07, 0.05]);
    const deliveryDays = rng.int(1, 9);
    const isFit = APPAREL.includes(prod.category) || prod.category === "Footwear";
    const historyMissing = cust.tenureDays < 45 || rng.chance(0.04);

    // Latent class scores + Gumbel noise -> noisy multinomial choice.
    const sAbusive =
      -3.4 +
      2.6 * cust.fraudPropensity +
      (discountPct >= 25 ? 0.35 : 0) +
      (orderValue > 6000 ? 0.3 : 0) +
      (cust.tenureDays < 120 ? 0.35 : 0);
    const sQuality =
      -2.1 + (prod.defectRate / 0.02) * 1.1 + (prod.category === "Footwear" ? 0.15 : 0);
    const sFit = -2.35 + (isFit ? 1.85 : -2.2) + Math.abs(prod.fitBias) * 1.05;
    const sWrong = -2.55 + (prod.category === "Accessories" ? 0.25 : 0);

    const scores = [sAbusive, sQuality, sFit, sWrong].map((s) => s + rng.gumbel());
    const labelIdx = scores.indexOf(Math.max(...scores));
    const LABELS4 = ["abusive", "genuine_quality_issue", "genuine_fit_issue", "genuine_wrong_item"] as const;
    // Behavior and reason text follow the TRUE (latent) class…
    const behaviorLabel = LABELS4[labelIdx];

    // Label-conditioned behavioural attributes (kept noisy).
    let daysSinceDelivery = rng.int(0, 29);
    if (behaviorLabel === "abusive") {
      daysSinceDelivery = rng.chance(0.55) ? rng.int(4, 16) : daysSinceDelivery;
    } else if (behaviorLabel === "genuine_fit_issue") {
      daysSinceDelivery = rng.chance(0.6) ? rng.int(0, 10) : daysSinceDelivery;
    }

    const priorOrders12m = historyMissing
      ? 0
      : Math.min(cust.lifetimeOrders, Math.max(0, Math.round(cust.lifetimeOrders * rng.range(0.2, 0.5))));
    const priorReturns12m = historyMissing
      ? 0
      : Math.round(priorOrders12m * Math.min(0.9, cust.returnPropensity * rng.range(0.5, 1.6)));

    const lang = rng.chance(0.92) ? cust.preferredLanguage : rng.pick(["en", "hinglish", "hi"] as const);
    const reasonText = rng.chance(0.06) ? "" : makeReason(rng, behaviorLabel, lang, prod.category);
    // …while ~4% of rows are noisy human triage annotations: the stored label
    // disagrees with intent. Produces genuinely hard cases and honest FP/FN so
    // review queues, error analysis and fairness gaps are meaningful.
    let label = behaviorLabel;
    if (rng.chance(0.05)) {
      const alts = [0, 1, 2, 3].filter((j) => j !== labelIdx);
      label = LABELS4[rng.pick(alts)];
    }
    const monthIndex = Math.min(11, Math.floor(rng.weighted(
      Array.from({ length: 12 }, (_, m) => m),
      Array.from({ length: 12 }, (_, m) => 1 + m * 0.07),
    )));

    cases.push({
      id: `RG-${100001 + i}`,
      customerId: cust.id,
      productId: prod.id,
      skuCategory: prod.category,
      orderValue,
      quantity,
      discountPct,
      deliveryDays,
      daysSinceDelivery,
      paymentMethod: rng.pick(PAYMENTS),
      region: cust.region,
      customerTenureDays: cust.tenureDays,
      priorOrders12m,
      priorReturns12m,
      accountOrdersLifetime: cust.lifetimeOrders,
      historyMissing,
      reasonText,
      detectedLanguage: reasonText ? lang : "missing",
      label,
      split: cust.split, // customer-grouped splits prevent identity leakage
      monthIndex,
    });
  }
  return { products, customers, cases };
}
