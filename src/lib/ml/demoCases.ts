// Ten illustrative demo scenarios for judges. These are DEMONSTRATION INPUTS,
// not ground-truth labels — every one is scored live by the implemented model.
// Where confirming evidence (images, warehouse scans) does not exist, the system
// must stay uncertain and route to humans; nothing here asserts verification.

import type { CaseInput } from "./labels";

export interface DemoCase {
  id: string;
  title: string;
  illustrates: string;
  input: CaseInput;
}

export const DEMO_CASES: DemoCase[] = [
  {
    id: "fit-jeans-1",
    title: "Recurring fit complaint — slim-fit jeans",
    illustrates: "Genuine fit language on a product flagged as running small; long-tenure customer.",
    input: {
      orderValue: 1899, quantity: 1, discountPct: 10, deliveryDays: 3, daysSinceDelivery: 4,
      paymentMethod: "card", category: "Jeans", region: "Bengaluru",
      customerTenureDays: 1240, priorOrders12m: 14, priorReturns12m: 2, accountOrdersLifetime: 31,
      reasonText: "Too tight around the waist — I ordered my usual 32. Size chart seems off for this one, please exchange for one size bigger.",
    },
  },
  {
    id: "wardrobe-1",
    title: "Possible wardrobing pattern",
    illustrates: "High prior-return rate, 12-day wear window, festive season wording. A signal for review — never proof.",
    input: {
      orderValue: 6499, quantity: 1, discountPct: 25, deliveryDays: 2, daysSinceDelivery: 12,
      paymentMethod: "card", category: "Dresses", region: "Mumbai",
      customerTenureDays: 210, priorOrders12m: 9, priorReturns12m: 5, accountOrdersLifetime: 11,
      reasonText: "Party ke liye mangaya tha, ab yeh style pasand nahi aa rahi. Return karna hai.",
    },
  },
  {
    id: "empty-box-1",
    title: "Unverified empty-box allegation",
    illustrates: "A serious claim with NO confirming evidence on file — the correct outcome is verification, not accusation.",
    input: {
      orderValue: 3299, quantity: 1, discountPct: 0, deliveryDays: 4, daysSinceDelivery: 1,
      paymentMethod: "cod", category: "Footwear", region: "Delhi NCR",
      customerTenureDays: 96, priorOrders12m: 2, priorReturns12m: 1, accountOrdersLifetime: 2,
      reasonText: "Box khali aaya tha, sirf paper tha andar. Item nahi mila. Refund chahiye.",
    },
  },
  {
    id: "torn-seam-1",
    title: "Reported torn seam",
    illustrates: "Specific, verifiable defect language on a product with elevated QC defect rate.",
    input: {
      orderValue: 1299, quantity: 1, discountPct: 15, deliveryDays: 5, daysSinceDelivery: 9,
      paymentMethod: "upi", category: "Shirts", region: "Pune",
      customerTenureDays: 780, priorOrders12m: 11, priorReturns12m: 1, accountOrdersLifetime: 18,
      reasonText: "The seam on the shoulder tore after the first wash. Stitching is coming apart — please process my return.",
    },
  },
  {
    id: "wrong-item-1",
    title: "Wrong-item complaint",
    illustrates: "Clear wrong-item language; invoice mismatch is internally checkable.",
    input: {
      orderValue: 2499, quantity: 2, discountPct: 5, deliveryDays: 6, daysSinceDelivery: 2,
      paymentMethod: "card", category: "Jackets", region: "Hyderabad",
      customerTenureDays: 1430, priorOrders12m: 16, priorReturns12m: 1, accountOrdersLifetime: 26,
      reasonText: "You sent the wrong item — ordered the olive bomber in M, received a black windcheater in XL. Invoice says something else entirely.",
    },
  },
  {
    id: "new-customer-1",
    title: "New customer, damaged goods",
    illustrates: "No history available — fairness guard: absence of history is treated as unknown, never as suspicion.",
    input: {
      orderValue: 1099, quantity: 1, discountPct: 20, deliveryDays: 7, daysSinceDelivery: 3,
      paymentMethod: "upi", category: "T-Shirts", region: "Jaipur",
      customerTenureDays: null, priorOrders12m: null, priorReturns12m: null, accountOrdersLifetime: null,
      reasonText: "Parcel mein se tee ka collar fata hua nikla. Pehli baar order kiya tha, kripaya return karwa dijiye.",
    },
  },
  {
    id: "low-value-1",
    title: "Low-value order, plausible quality complaint",
    illustrates: "Fairness check: low order value must not inflate suspicion.",
    input: {
      orderValue: 499, quantity: 1, discountPct: 0, deliveryDays: 4, daysSinceDelivery: 6,
      paymentMethod: "wallet", category: "Accessories", region: "Kolkata",
      customerTenureDays: 540, priorOrders12m: 8, priorReturns12m: 1, accountOrdersLifetime: 12,
      reasonText: "Strap buckle broke within a day of use. Kapda bhi sasta laga. Please refund as per policy.",
    },
  },
  {
    id: "hinglish-fit-1",
    title: "Hinglish fit complaint",
    illustrates: "Romanized Hindi fit language is legitimate input and must be understood, not penalized.",
    input: {
      orderValue: 1599, quantity: 1, discountPct: 10, deliveryDays: 3, daysSinceDelivery: 5,
      paymentMethod: "upi", category: "Kurtas", region: "Lucknow",
      customerTenureDays: 660, priorOrders12m: 10, priorReturns12m: 2, accountOrdersLifetime: 15,
      reasonText: "Size chota hai, exchange karna hai. Chest se bahut tight hai, ek size bada bhej dijiye.",
    },
  },
  {
    id: "devanagari-quality-1",
    title: "Transliterated + Devanagari quality complaint",
    illustrates: "Script handling: Devanagari tokenization and quality vocabulary.",
    input: {
      orderValue: 2199, quantity: 1, discountPct: 15, deliveryDays: 4, daysSinceDelivery: 8,
      paymentMethod: "card", category: "Dresses", region: "Delhi NCR",
      customerTenureDays: 900, priorOrders12m: 12, priorReturns12m: 1, accountOrdersLifetime: 20,
      reasonText: "पहली धुलाई में ही सिलाई खुल गई है और zip bhi kharab hai. Quality bilkul bekar hai, refund chahiye.",
    },
  },
  {
    id: "conflicting-1",
    title: "Conflicting signals",
    illustrates: "Genuine-sounding text on a high-return-risk profile — the model should stay uncertain and humans should decide.",
    input: {
      orderValue: 7999, quantity: 2, discountPct: 40, deliveryDays: 2, daysSinceDelivery: 15,
      paymentMethod: "cod", category: "Jeans", region: "Chandigarh",
      customerTenureDays: 60, priorOrders12m: 7, priorReturns12m: 4, accountOrdersLifetime: 7,
      reasonText: "Stitching near the pocket came apart. Fit bhi thoda loose hai. Not as expected, want to return.",
    },
  },
];
