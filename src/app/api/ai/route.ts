import { NextResponse } from "next/server";
import { aiGenerate, aiKeyConfigured, activeModelName, sanitizeForPrompt } from "@/lib/ai";
import { draftMessage, type MessageCategory, type MessageLanguage } from "@/lib/ml/messages";
import { rateLimit, clientIp, consumeAiBudget } from "@/lib/rate";
import { CLASSES, CLASS_META, type ReturnClass } from "@/lib/ml/labels";

export const dynamic = "force-dynamic";

/**
 * AI generation endpoint. Uses Gemini when GEMINI_API_KEY is configured,
 * otherwise a deterministic policy-safe built-in generator — provider is always
 * reported honestly in the response. No key material ever leaves the server.
 */
export async function POST(req: Request) {
  const rl = rateLimit(`ai:${clientIp(req)}`, 15, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", message: "Too many AI requests. Wait a minute and retry." }, { status: 429 });
  }
  const budget = consumeAiBudget();
  if (!budget.allowed) {
    return NextResponse.json({ error: "budget_exhausted", message: budget.reason }, { status: 429 });
  }
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const task = typeof body.task === "string" ? body.task : "draft";

    if (task === "draft") {
      const language = (["en", "hinglish", "hi"].includes(String(body.language)) ? body.language : "en") as MessageLanguage;
      const category = (
        [...CLASSES, "ambiguous"].includes(String(body.category))
          ? body.category
          : "ambiguous"
      ) as MessageCategory;
      const customerName = sanitizeForPrompt(String(body.customerName ?? ""), 64);
      const productName = sanitizeForPrompt(String(body.productName ?? ""), 96);
      const classLabel = category === "ambiguous" ? "ambiguous case requiring additional evidence" : CLASS_META[category as ReturnClass].label;
      const langLabel = language === "hi" ? "Hindi (Devanagari script)" : language === "hinglish" ? "romanized Hinglish" : "English";

      const prompt = [
        `Write a customer resolution message in ${langLabel}.`,
        `Category: ${classLabel}.`,
        customerName ? `Customer name: ${customerName}.` : "",
        productName ? `Product: ${productName}.` : "",
        category === "genuine_fit_issue"
          ? "Acknowledge the fit problem kindly; mention the correction will feed the size chart."
          : category === "abusive" || category === "ambiguous"
            ? "Ask for a photo of the item as received and the packing slip — frame as routine verification."
            : "Apologize for the specific failure; keep it warm and simple.",
      ]
        .filter(Boolean)
        .join("\n");

      const fallback = () => draftMessage({ category, language, customerName: customerName || undefined, productName: productName || undefined }).body;
      const result = await aiGenerate(prompt, fallback);
      const notes = [
        "30-day free returns · zero restocking fee",
        category === "abusive" ? "Verification request only — no accusation" : "Resolution tone — policy compliant",
        "Human approval required before sending",
      ];
      return NextResponse.json({ body: result.text, provider: result.provider, model: result.model ?? null, notes });
    }

    if (task === "explain") {
      // Plain-language narrative for a scored case (ELI15): facts + prediction.
      const facts = Array.isArray(body.facts) ? body.facts.slice(0, 10).map((f) => sanitizeForPrompt(String(f), 300)) : [];
      const predicted = sanitizeForPrompt(String(body.predictedClass ?? ""), 48);
      const routing = sanitizeForPrompt(String(body.routing ?? ""), 32);
      if (facts.length === 0 || !predicted) {
        return NextResponse.json({ error: "missing_context", message: "facts and predictedClass are required." }, { status: 422 });
      }
      const prompt = [
        `Explain this scored return case in 3 short plain sentences, understandable without ML knowledge:`,
        `Prediction: ${predicted}. Operational routing: ${routing} (a recommendation to humans, not a verdict).`,
        `Observed facts: ${facts.join(" ")}`,
        "Do not accuse anyone of fraud. Do not invent facts. Mention that a human makes the final call.",
      ].join("\n");
      const fallback = () =>
        `The system scored this case as '${predicted}' and suggests ${routing}. ${facts[0] ?? ""} A human reviewer makes the final decision — the AI only recommends.`;
      const result = await aiGenerate(prompt, fallback);
      return NextResponse.json({ body: result.text, provider: result.provider, model: result.model ?? null });
    }

    return NextResponse.json({ error: "unknown_task", valid: ["draft", "explain"] }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: "ai_failed", message: e instanceof Error ? e.message.slice(0, 200) : "unknown" },
      { status: 500 },
    );
  }
}

/** Provider status for UI chips — never exposes whether the key VALUE exists beyond boolean. */
export async function GET() {
  return NextResponse.json({
    provider: aiKeyConfigured() ? "gemini" : "built-in",
    model: activeModelName(),
    hint: aiKeyConfigured()
      ? "Gemini active"
      : "Add GEMINI_API_KEY (free: aistudio.google.com → Get API key) to .env and restart — until then a policy-safe built-in generator is used.",
  });
}
