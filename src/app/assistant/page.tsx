"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Languages, Send } from "lucide-react";
import { ClassBadge, ErrorState, PageHeader, Panel } from "@/components/ui";
import { MESSAGE_LANGUAGES } from "@/lib/ml/messages";
import { CLASS_META, CLASSES, POLICY, type ReturnClass } from "@/lib/ml/labels";

type Category = ReturnClass | "ambiguous";

interface DraftRow {
  id: number;
  case_id: string | null;
  category: string;
  language: string;
  body: string;
  approved_by: string;
  created_at: string;
}

export default function AssistantPage() {
  const [category, setCategory] = useState<Category>("genuine_fit_issue");
  const [language, setLanguage] = useState<"en" | "hinglish" | "hi">("en");
  const [customerName, setCustomerName] = useState("Aarav");
  const [productName, setProductName] = useState("Aster Slim-Fit Jeans");
  const [draft, setDraft] = useState<string>("");
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [approver, setApprover] = useState("");
  const [approveChecked, setApproveChecked] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [history, setHistory] = useState<DraftRow[]>([]);

  const loadHistory = () =>
    fetch("/api/message").then((r) => r.json()).then((d) => setHistory(d.rows ?? [])).catch(() => undefined);
  useEffect(() => {
    void loadHistory();
  }, []);

  const generate = async () => {
    setBusy(true);
    setErr(null);
    setSavedId(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "draft", category, language, customerName, productName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error);
      setDraft(data.body);
      setNotes(data.notes ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  const approveAndSave = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, language, approve: true, approvedBy: approver, draftedBody: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error);
      if (data.savedId) {
        setSavedId(data.savedId);
        loadHistory();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Customer Resolution Assistant"
        title="Respectful replies, in the customer's language"
        description="Policy-constrained drafting for fit, quality and wrong-item resolutions plus careful evidence requests for ambiguous cases — in English, Hinglish or हिन्दी. The system never sends anything: a named human must approve every draft."
        actions={
          <span className="chip border-tealx/50 bg-tealx/10 text-tealx">
            <Languages size={11} /> AI assistant active
          </span>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <Panel title="Draft composer">
          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-fog">Resolution category</p>
              <div className="flex flex-wrap gap-1.5">
                {CLASSES.map((c) => (
                  <button key={c} onClick={() => setCategory(c)} className="btn !py-1.5 text-[0.7rem]"
                    style={category === c ? { borderColor: CLASS_META[c].color, color: CLASS_META[c].color } : undefined}>
                    {CLASS_META[c].short}
                  </button>
                ))}
                <button onClick={() => setCategory("ambiguous")} className={`btn !py-1.5 text-[0.7rem] ${category === "ambiguous" ? "border-amberx/60 text-amberx" : ""}`}>
                  Ambiguous / needs evidence
                </button>
              </div>
              {category === "abusive" && (
                <p className="mt-2 rounded-lg border border-amberx/30 bg-amberx/10 p-2.5 text-[0.7rem] leading-relaxed text-amberx">
                  Suspected-abuse cases only ever receive a neutral verification request — never an accusation. Specialists decide outcomes.
                </p>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-fog">Reply language</p>
              <div className="flex gap-1.5">
                {MESSAGE_LANGUAGES.map((l) => (
                  <button key={l.id} onClick={() => setLanguage(l.id)} className={`btn !py-1.5 text-[0.7rem] ${language === l.id ? "border-cyanx/60 bg-cyanx/10 text-snow" : ""}`}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="mb-1 block text-[0.65rem] uppercase tracking-widest text-fog">Customer name</span>
                <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </label>
              <label>
                <span className="mb-1 block text-[0.65rem] uppercase tracking-widest text-fog">Product</span>
                <input className="input" value={productName} onChange={(e) => setProductName(e.target.value)} />
              </label>
            </div>

            <button onClick={() => generate()} disabled={busy} className="btn btn-primary">
              <Send size={14} /> {busy ? "AI is drafting…" : "Generate with AI"}
            </button>

            {draft && (
              <div className="border-t hairline pt-3">
                <label className="flex items-start gap-2 text-[0.72rem] text-mist">
                  <input type="checkbox" className="mt-0.5 accent-[#8b6f47]" checked={approveChecked} onChange={(e) => setApproveChecked(e.target.checked)} />
                  I am a human reviewer and I have verified this message follows policy.
                </label>
                <div className="mt-2 flex gap-2">
                  <input className="input !py-1.5 text-[0.75rem]" placeholder="Approver name (required)" value={approver} onChange={(e) => setApprover(e.target.value)} />
                  <button
                    className="btn btn-primary !py-1.5 text-[0.72rem]"
                    disabled={!approveChecked || !approver.trim() || busy}
                    onClick={() => approveAndSave()}
                  >
                    <CheckCircle2 size={13} /> Approve & save
                  </button>
                </div>
                {savedId && <p className="num mt-2 text-[0.68rem] text-tealx">Saved as approved draft #{savedId} (audit persisted).</p>}
              </div>
            )}
            {err && <ErrorState message={err} />}
          </div>
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel title="Draft preview" sub={draft ? "Editable — meaning preserved from the customer's original intent" : "Generate a draft to preview"}>
            {draft ? (
              <>
                <textarea
                  className="input h-64 resize-y font-sans text-[0.84rem] leading-relaxed"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div className="mt-3 flex items-center gap-2">
                  <button className="btn !py-1.5 text-[0.72rem]" onClick={() => navigator.clipboard.writeText(draft)}>
                    <Copy size={12} /> Copy
                  </button>
                  {notes.map((n, i) => (
                    <span key={i} className="chip text-[0.62rem]">{n}</span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[0.78rem] text-fog">
                Nothing drafted yet. Guardrails: {POLICY.summary}
              </p>
            )}
          </Panel>

          <Panel title="Approved drafts (persisted audit)" sub={`${history.length} recent`}>
            {history.length === 0 ? (
              <p className="text-[0.75rem] text-fog">No approved drafts yet — approving a draft stores it in PostgreSQL.</p>
            ) : (
              <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {history.map((h) => (
                  <li key={h.id} className="rounded-lg border hairline bg-abyss/50 p-3">
                    <div className="flex items-center gap-2">
                      <span className="num text-[0.65rem] text-fog">#{h.id}</span>
                      <ClassBadge cls={h.category === "ambiguous" ? "genuine_fit_issue" : (h.category as ReturnClass)} />
                      {h.category === "ambiguous" && <span className="chip text-amberx">ambiguous</span>}
                      <span className="chip">{h.language}</span>
                      <span className="ml-auto text-[0.65rem] text-fog">approved by <b className="text-mist">{h.approved_by}</b></span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[0.74rem] text-mist">{h.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
