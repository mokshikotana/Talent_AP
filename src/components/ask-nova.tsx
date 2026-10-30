"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, Send, Sparkles, X, Loader2 } from "lucide-react";
import { useMode } from "@/components/ui";

interface Turn {
  role: "user" | "assistant";
  text: string;
  provider?: string;
}

const PAGE_NAMES: Record<string, string> = {
  "/": "Command Center",
  "/engine": "Return Decision Engine",
  "/workbench": "Human Review Workbench",
  "/explainability": "Explainability Studio",
  "/evaluation": "Model Evaluation Lab",
  "/fairness": "Fairness Observatory",
  "/fit": "Fit Intelligence Studio",
  "/assistant": "Resolution Assistant",
  "/data": "Data & Model Management",
  "/audit": "Audit & System Health",
};

const STARTERS = [
  "What does this page show me?",
  "Why was my return sent for inspection?",
  "What is the return policy?",
  "How accurate is the AI?",
];

export function AskNova() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<string>("");
  const pathname = usePathname();
  const { mode } = useMode();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pageName = PAGE_NAMES[pathname] ?? "ReturnGuard";

  useEffect(() => {
    fetch("/api/assistant")
      .then((r) => r.json())
      .then((d) => setProvider(d.provider))
      .catch(() => setProvider("built-in"));
  }, []);

  useEffect(() => {
    if (open) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [turns, open]);

  // Close on Escape for keyboard accessibility
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setInput("");
    const nextTurns: Turn[] = [...turns, { role: "user", text: question }];
    setTurns(nextTurns);
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          page: pageName,
          mode,
          history: nextTurns.slice(-5).map((t) => ({ role: t.role, text: t.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTurns((t) => [...t, { role: "assistant", text: data.message ?? "Something went wrong. Please try again." }]);
      } else {
        setTurns((t) => [...t, { role: "assistant", text: data.answer, provider: data.provider }]);
        if (data.provider) setProvider(data.provider);
      }
    } catch {
      setTurns((t) => [
        ...t,
        { role: "assistant", text: "I could not reach the server. Check your connection and try again." },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Launcher — bottom right on every page */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ask Nova — AI help assistant"
          className="group fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border border-cyanx/40 bg-panel px-4 py-3 shadow-[0_10px_30px_-10px_rgba(139,111,71,0.5)] transition-all hover:border-cyanx hover:shadow-[0_14px_38px_-12px_rgba(139,111,71,0.7)]"
        >
          <span className="relative grid h-6 w-6 place-items-center rounded-full bg-cyanx/15">
            <MessageCircle size={14} className="text-cyanx" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-tealx pulse-dot" />
          </span>
          <span className="text-[0.8rem] font-semibold text-snow">Ask Nova</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Ask Nova assistant"
          className="fixed bottom-5 right-5 z-50 flex max-h-[min(70vh,560px)] w-[min(calc(100vw-2.5rem),380px)] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_24px_60px_-20px_rgba(60,52,40,0.45)]"
        >
          <header className="flex items-center gap-2.5 border-b hairline bg-abyss px-4 py-3">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-cyanx/15">
              <Sparkles size={14} className="text-cyanx" />
            </span>
            <div className="flex-1">
              <p className="text-[0.82rem] font-semibold leading-tight text-snow">Ask Nova</p>
              <p className="text-[0.62rem] leading-tight text-fog">
                {provider === "gemini" ? "Gemini AI · answers from live app data" : "Built-in help · answers from app data"}
              </p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close assistant" className="btn !border-transparent !bg-transparent !p-1.5">
              <X size={15} />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3.5">
            {turns.length === 0 && (
              <div>
                <p className="text-[0.8rem] leading-relaxed text-mist">
                  Hi! I can explain anything on this page in simple words — what the numbers mean, why a return was
                  flagged, or what our return policy says.
                </p>
                <p className="mt-2 text-[0.68rem] text-fog">You&apos;re on: <b className="text-mist">{pageName}</b></p>
                <div className="mt-3 flex flex-col gap-1.5">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="rounded-lg border hairline bg-abyss px-3 py-2 text-left text-[0.75rem] text-mist transition-colors hover:border-cyanx/40 hover:text-snow"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[0.78rem] leading-relaxed ${
                    t.role === "user"
                      ? "rounded-br-sm bg-cyanx/15 text-snow"
                      : "rounded-bl-sm border hairline bg-abyss text-mist"
                  }`}
                >
                  {t.text}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-[0.72rem] text-fog">
                <Loader2 size={13} className="animate-spin text-cyanx" /> Nova is reading the live data…
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex items-center gap-2 border-t hairline bg-abyss px-3 py-2.5"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={900}
              placeholder="Ask about this page or your return…"
              aria-label="Your question"
              className="input !py-2 text-[0.78rem]"
            />
            <button type="submit" disabled={busy || !input.trim()} className="btn btn-primary !px-3 !py-2" aria-label="Send question">
              <Send size={14} />
            </button>
          </form>
          <p className="border-t hairline bg-abyss px-4 py-1.5 text-center text-[0.6rem] text-fog">
            Nova answers from this app&apos;s data. A human always makes the final decision.
          </p>
        </div>
      )}
    </>
  );
}
