// Deterministic Nova fallback for quota/outage conditions. It answers common
// questions accurately from supplied live facts and mirrors English, Hinglish,
// or Hindi. This is deliberately pure and independently testable.

import { POLICY } from "@/lib/ml/labels";
import { detectLanguage } from "@/lib/ml/text";

export interface NovaFallbackContext {
  question: string;
  page: string;
  mode: "demo" | "real";
  totalCases: number | null;
  testCases: number | null;
  accuracy: number | null;
  macroF1: number | null;
}

const PAGE_HELP: Record<string, string> = {
  "Command Center": "It summarizes return volume, routing, model quality, fairness, and system health.",
  "Return Decision Engine": "It scores one return or a CSV batch and explains each recommendation.",
  "Human Review Workbench": "It lets a person inspect evidence, approve, override, or request more information.",
  "Explainability Studio": "It shows which words and order facts influenced the AI recommendation.",
  "Model Evaluation Lab": "It shows measured cost, accuracy, calibration, and class-by-class errors.",
  "Fairness Observatory": "It compares error and routing rates across customer, order-value, and language groups.",
  "Fit Intelligence Studio": "It identifies products causing fit returns and suggests size-guide corrections.",
  "Resolution Assistant": "It drafts respectful customer messages that a human must approve before sending.",
  "Data & Model Management": "It documents the upload fields, model runs, and data source.",
  "Audit & System Health": "It shows service health and an immutable history of human actions.",
};

function containsAny(q: string, terms: string[]): boolean {
  return terms.some((t) => q.includes(t));
}

export function novaFallback(ctx: NovaFallbackContext): string {
  const q = ctx.question.toLowerCase();
  const lang = detectLanguage(ctx.question);
  const isHi = lang === "hi";
  const isHinglish = lang === "hinglish";

  const policyIntent = containsAny(q, [
    "policy", "refund", "return window", "restocking", "wapas", "paisa", "रिफंड", "वापस", "नीति",
  ]);
  const sizeIntent = containsAny(q, [
    "size", "fit", "tight", "loose", "chota", "chhota", "bada", "exchange", "साइज़", "छोटा", "बड़ा", "टाइट",
  ]);
  const inspectIntent = containsAny(q, ["inspect", "review", "flag", "जाँच", "समीक्षा"]);
  const pageIntent = containsAny(q, ["page", "screen", "show", "what is this", "पेज", "दिखता", "स्क्रीन"]);
  const countIntent = containsAny(q, ["how many", "count", "total", "kitne", "कितने", "कुल"]);
  const metricIntent = containsAny(q, ["accur", "performance", "macro", "f1", "score", "सटीक", "accuracy"]);

  if (policyIntent) {
    if (isHi) {
      return "हमारी नीति सरल है: 30 दिनों के भीतर रिटर्न मुफ्त है और कोई रीस्टॉकिंग शुल्क नहीं है। आइटम मिलने और सत्यापित होने के बाद रिफंड मूल भुगतान माध्यम में किया जाता है।";
    }
    if (isHinglish) {
      return "Policy simple hai: 30 din ke andar return bilkul free hai aur koi restocking fee nahi hai. Item receive aur verify hone ke baad refund original payment method par hota hai.";
    }
    return `Our policy is simple: ${POLICY.summary} A human support reviewer can help if your case needs extra attention.`;
  }

  if (sizeIntent) {
    if (isHi) {
      return "अगर साइज़ छोटा या बड़ा है, तो रिटर्न कारण में सही फिट की समस्या साफ लिखें। 30 दिनों के भीतर रिटर्न मुफ्त है; AI इसे फिट समस्या के रूप में समझेगा, लेकिन अंतिम निर्णय इंसान करेगा।";
    }
    if (isHinglish) {
      return "Agar size chota ya bada hai, reason mein fit problem clearly likhiye. 30 din ke andar return free hai; AI ise fit issue samjhega, lekin final decision human reviewer karega.";
    }
    return "If the size is wrong, describe where it feels tight or loose and the size you expected. Returns are free within 30 days; the AI can recognize a fit issue, but a human makes the final decision.";
  }

  if (inspectIntent) {
    if (isHi) {
      return "INSPECT का मतलब है कि जानकारी अधूरी है या संकेत आपस में मेल नहीं खाते, इसलिए इंसान को केस देखना चाहिए। यह रिटर्न अस्वीकार करना या ग्राहक पर आरोप लगाना नहीं है।";
    }
    if (isHinglish) {
      return "INSPECT ka matlab hai information incomplete hai ya signals agree nahi kar rahe, isliye human ko case check karna chahiye. Yeh rejection ya accusation nahi hai.";
    }
    return "INSPECT means the evidence is incomplete or the signals disagree, so a person should check the case. It is not a rejection or an accusation; a human makes the final decision.";
  }

  if (countIntent && ctx.totalCases !== null) {
    if (isHi) return `${ctx.mode === "demo" ? "डेमो" : "वास्तविक"} मोड में अभी ${ctx.totalCases.toLocaleString("en-IN")} रिटर्न का विश्लेषण किया गया है।`;
    if (isHinglish) return `${ctx.mode === "demo" ? "Demo" : "Real"} mode mein abhi ${ctx.totalCases.toLocaleString("en-IN")} returns analyze hue hain.`;
    return `${ctx.mode === "demo" ? "Demo" : "Real"} mode currently contains ${ctx.totalCases.toLocaleString("en-IN")} analyzed returns.`;
  }

  if (metricIntent && ctx.accuracy !== null) {
    const test = ctx.testCases?.toLocaleString("en-IN") ?? "the held-out test";
    const f1 = ctx.macroF1 !== null ? ` and macro-F1 was ${(ctx.macroF1 * 100).toFixed(1)}%` : "";
    if (isHi) return `AI को ${test} मामलों पर मापा गया था। इसकी सटीकता ${(ctx.accuracy * 100).toFixed(1)}% थी${f1}; पूरी जानकारी Model Evaluation Lab में है।`;
    if (isHinglish) return `AI ko ${test} test cases par measure kiya gaya. Accuracy ${(ctx.accuracy * 100).toFixed(1)}% thi${f1}; full evidence Model Evaluation Lab mein hai.`;
    return `The AI was measured on ${test} cases. Accuracy was ${(ctx.accuracy * 100).toFixed(1)}%${f1}; open the Model Evaluation Lab for the full evidence.`;
  }

  if (pageIntent) {
    const help = PAGE_HELP[ctx.page] ?? "It helps staff understand and act on return decisions.";
    if (isHi) return `आप ${ctx.page} पेज पर हैं। यहाँ रिटर्न के निर्णय और उनसे जुड़ी जानकारी समझी जा सकती है।`;
    if (isHinglish) return `Aap ${ctx.page} page par hain. Yahan return decisions aur unki details simple way mein samajh sakte hain.`;
    return `You are on the ${ctx.page} page. ${help}`;
  }

  if (isHi) {
    return "ReturnGuard AI रिटर्न अनुरोध को समझता है, कारण बताता है और auto-approve, inspect या escalate की सलाह देता है। अंतिम निर्णय हमेशा इंसान करता है।";
  }
  if (isHinglish) {
    return "ReturnGuard AI return request ko samajhta hai, reason explain karta hai aur auto-approve, inspect ya escalate suggest karta hai. Final decision hamesha human reviewer karta hai.";
  }
  return "ReturnGuard AI understands return requests, explains the evidence, and recommends auto-approve, inspect, or escalate. A human always makes the final decision.";
}
