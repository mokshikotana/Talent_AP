"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCheck, ChevronLeft, ChevronRight, FileWarning, Hourglass, Megaphone, RefreshCw, Search, ThumbsUp } from "lucide-react";
import { ClassBadge, EmptyState, ErrorState, Loading, PageHeader, Panel, RoutingBadge, fmtInr } from "@/components/ui";
import { PredictionResult } from "@/components/predict";

interface QueueRow {
  id: string;
  order_value: number;
  days_since_delivery: number;
  region: string;
  sku_category: string;
  reason_text: string;
  detected_language: string;
  label: string | null;
  source: string;
  probs: Record<string, number>;
  predicted_class: string;
  routing: "INSPECT" | "ESCALATE";
  expected_cost: number;
  calibrated_confidence: number;
  review_status: string;
  product_name: string | null;
  customer_tenure_days: number | null;
  prior_orders_12m: number | null;
  prior_returns_12m: number | null;
  history_missing: number;
}

const ACTIONS = [
  { id: "approve", label: "Approve return", icon: ThumbsUp, tone: "btn", needsReason: false },
  { id: "override-auto-approve", label: "Override → auto-approve", icon: CheckCheck, tone: "btn", needsReason: true },
  { id: "override-escalate", label: "Override → escalate", icon: Megaphone, tone: "btn btn-danger", needsReason: true },
  { id: "evidence-request", label: "Request evidence", icon: FileWarning, tone: "btn", needsReason: false },
  { id: "pending", label: "Mark pending", icon: Hourglass, tone: "btn", needsReason: false },
  { id: "outcome", label: "Record outcome", icon: CheckCheck, tone: "btn", needsReason: true },
] as const;

export default function WorkbenchPage() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<string>("");
  const [status, setStatus] = useState<string>("open");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<QueueRow | null>(null);
  const [explain, setExplain] = useState<Record<string, unknown> | null>(null);
  const [note, setNote] = useState("");
  const [actor, setActor] = useState("r.sharma");
  const [toast, setToast] = useState<string | null>(null);
  const limit = 15;

  const load = useCallback(() => {
    setLoading(true);
    const q = new URLSearchParams({ limit: String(limit), offset: String(page * limit), status });
    if (filter) q.set("routing", filter);
    fetch(`/api/review?${q}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).message ?? "failed");
        return r.json();
      })
      .then((d) => {
        setRows(d.rows);
        setTotal(d.total);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [filter, status, page]);

  useEffect(load, [load]);

  const openCase = async (r: QueueRow) => {
    setSelected(r);
    setExplain(null);
    setNote("");
    const res = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderValue: r.order_value,
        quantity: 1,
        discountPct: 0,
        deliveryDays: 0,
        daysSinceDelivery: r.days_since_delivery,
        paymentMethod: "unknown",
        category: r.sku_category,
        region: r.region,
        customerTenureDays: r.history_missing ? null : r.customer_tenure_days,
        priorOrders12m: r.history_missing ? null : r.prior_orders_12m,
        priorReturns12m: r.history_missing ? null : r.prior_returns_12m,
        accountOrdersLifetime: null,
        reasonText: r.reason_text,
      }),
    });
    const data = await res.json();
    setExplain(data);
  };

  const act = async (action: string, needsReason: boolean) => {
    if (!selected) return;
    if (needsReason && note.trim().length < 3) {
      setToast("A reason is required for overrides and outcomes.");
      return;
    }
    const res = await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: selected.id, action, detail: note, actor }),
    });
    const data = await res.json();
    if (!res.ok) {
      setToast(data.message ?? "Action failed");
      return;
    }
    setToast(`${action} recorded for ${selected.id} — audit trail updated, model prediction preserved.`);
    setSelected(null);
    load();
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Human Review Workbench"
        title="The queue that humans control"
        description="Inspect and escalate cases land here. The model's original prediction is immutable; every human action — approvals, overrides, evidence requests, outcomes — is appended to the audit trail with actor and timestamp."
      />

      {toast && (
        <div className="rise mb-4 rounded-lg border border-cyanx/40 bg-cyanx/10 px-4 py-2.5 text-[0.8rem] text-cyanx" role="status">
          {toast}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {["", "ESCALATE", "INSPECT"].map((f) => (
            <button key={f || "all"} onClick={() => { setFilter(f); setPage(0); }} className={`btn !py-1.5 text-[0.72rem] ${filter === f ? "border-cyanx/60 bg-cyanx/10 text-snow" : ""}`}>
              {f || "All"}
            </button>
          ))}
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} className="input !w-auto !py-1.5 text-[0.75rem]">
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="decided">Decided</option>
        </select>
        <span className="ml-auto text-[0.72rem] text-fog">{total.toLocaleString("en-IN")} cases in view</span>
        <button onClick={load} className="btn !p-2" aria-label="Refresh"><RefreshCw size={13} /></button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_440px]">
        <div>
          {loading && <Loading label="Loading queue…" />}
          {error && <ErrorState message={error} onRetry={load} />}
          {!loading && !error && rows.length === 0 && (
            <EmptyState title="Queue clear" hint="No cases match this filter. Auto-approved returns never enter the human queue." />
          )}
          {!loading && !error && rows.length > 0 && (
            <div className="flex flex-col gap-2">
              {rows.map((r) => (
                <button
                  key={r.id}
                  onClick={() => openCase(r)}
                  className={`panel panel-hover px-4 py-3 text-left transition-all ${selected?.id === r.id ? "border-cyanx/60" : ""}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="num text-[0.72rem] text-fog">{r.id}</span>
                    <RoutingBadge routing={r.routing} />
                    <ClassBadge cls={r.predicted_class as never} />
                    <span className="chip">{r.detected_language}</span>
                    {r.source !== "synthetic-demo" && <span className="chip border-violetx/40 text-violetx">{r.source}</span>}
                    <span className="ml-auto num text-[0.72rem] text-mist">{fmtInr(r.order_value)}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[0.76rem] text-mist">
                    {r.reason_text || <span className="italic text-fog/70">no reason provided</span>}
                  </p>
                  <p className="num mt-1 text-[0.65rem] text-fog/80">
                    {r.product_name ?? "no product"} · expected cost {r.expected_cost.toFixed(3)} · confidence {(r.calibrated_confidence * 100).toFixed(0)}%
                  </p>
                </button>
              ))}
              <div className="flex items-center justify-between pt-1">
                <button className="btn !py-1.5 text-[0.72rem]" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <ChevronLeft size={13} /> Newer
                </button>
                <span className="num text-[0.7rem] text-fog">page {page + 1}</span>
                <button className="btn !py-1.5 text-[0.72rem]" disabled={(page + 1) * limit >= total} onClick={() => setPage(page + 1)}>
                  Older <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          {selected ? (
            <Panel
              title={selected.id}
              sub="Model prediction frozen at scoring time — recorded human actions are separate"
              className="rise sticky top-4"
            >
              {selected.label && (
                <p className="mb-3 rounded-lg border border-amberx/30 bg-amberx/10 px-3 py-2 text-[0.7rem] text-amberx">
                  Demo ground truth (synthetic label): <b>{selected.label}</b> — visible because this is the labeled demo dataset.
                </p>
              )}
              {explain ? (
                <div className="mb-4 max-h-[420px] overflow-y-auto pr-1">
                  <PredictionResult p={explain as never} />
                </div>
              ) : (
                <Loading label="Recomputing explanation…" />
              )}
              <div className="border-t hairline pt-3">
                <label className="mb-2 block">
                  <span className="mb-1 block text-[0.65rem] uppercase tracking-widest text-fog">Reviewer</span>
                  <input className="input !py-1.5 text-[0.75rem]" value={actor} onChange={(e) => setActor(e.target.value)} />
                </label>
                <label className="mb-3 block">
                  <span className="mb-1 block text-[0.65rem] uppercase tracking-widest text-fog">
                    Reason / note <span className="text-amberx">(required for overrides & outcomes)</span>
                  </span>
                  <textarea className="input h-16 resize-y text-[0.75rem]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. warehouse scan confirms item weight matches listing" />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ACTIONS.map((a) => (
                    <button key={a.id} onClick={() => act(a.id, a.needsReason)} className={`${a.tone} !py-1.5 text-[0.7rem]`}>
                      <a.icon size={12} /> {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </Panel>
          ) : (
            <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
              <Search size={20} className="text-cyanx/70" />
              <p className="text-[0.85rem] font-medium text-snow">Select a case to review</p>
              <p className="max-w-xs text-[0.75rem] text-fog">
                You&apos;ll see the frozen model output, a recomputed evidence panel, and every available human action.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
