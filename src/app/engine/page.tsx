"use client";

import { useRef, useState } from "react";
import { FileUp, ListTodo, Play, ScanSearch, Download } from "lucide-react";
import { DemoTag, ErrorState, PageHeader, Panel, RoutingBadge, ClassBadge } from "@/components/ui";
import { PredictionResult } from "@/components/predict";
import { SingleAnalysis, type PredictionFull } from "@/components/single-analysis";
import { DEMO_CASES } from "@/lib/ml/demoCases";

export default function EnginePage() {
  const [tab, setTab] = useState<"single" | "batch" | "library">("single");
  return (
    <div>
      <PageHeader
        eyebrow="Return Decision Engine"
        title="Score returns, one or one thousand at a time"
        description="Every case receives a calibrated four-class probability, a cost-aware three-way operational routing, and evidence-backed explanations. Rejected rows are reported — never silently discarded."
        actions={<DemoTag label="Demo model · synthetic training data" />}
      />
      <div className="mb-5 flex flex-wrap gap-1.5" role="tablist" aria-label="Engine modes">
        {(
          [
            ["single", "Single case analysis", ScanSearch],
            ["batch", "Batch CSV scoring", FileUp],
            ["library", "Judge scenario library", ListTodo],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`btn ${tab === id ? "border-cyanx/60 bg-cyanx/10 text-snow" : ""}`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
      {tab === "single" && <SingleAnalysis persist />}
      {tab === "batch" && <BatchPanel />}
      {tab === "library" && <DemoLibrary />}
    </div>
  );
}

function BatchPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<null | {
    summary: { received: number; accepted: number; rejected: number; warnings: string[] };
    rejected: { row: number; errors: string[]; original: Record<string, string> }[];
    results: { caseId: string; row: number; predictedClass: string; routing: string; confidence: number; language: string }[];
    resultsCsv: string;
  }>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const submit = async () => {
    if (!csv.trim()) {
      setFatal("Choose a CSV file first (or paste content).");
      return;
    }
    setBusy(true);
    setFatal(null);
    try {
      const res = await fetch("/api/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Batch failed");
      setResp(data);
    } catch (e) {
      setFatal(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!resp) return;
    const blob = new Blob([resp.resultsCsv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "returnguard-batch-results.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex flex-col gap-5">
      <Panel title="Batch upload" sub="Max 1,500 rows / 2 MB · required column: order_value · original rows preserved in the output">
        <div className="flex flex-col gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setName(f.name);
              f.text().then(setCsv);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <FileUp size={14} /> {name ?? "Choose CSV file"}
            </button>
            <button
              className="btn"
              onClick={() => {
                setCsv(
                  [
                    "order_value,quantity,discount_pct,reason_text,category,payment_method,days_since_delivery,customer_tenure_days,prior_orders_12m,prior_returns_12m",
                    "2299,1,0,Seam tore near pocket after first wash,Jeans,card,5,900,10,1",
                    "4500,1,25,Wore it to a wedding shaadi, ab return karna hai,Dresses,card,14,140,8,5",
                    "899,1,0,गलत आइटम आया है,Footwear,upi,2,300,5,0",
                    "1299,1,0,size chota hai exchange karna hai,Kurtas,upi,4,700,9,1",
                    "not_a_number,1,0,broken row example,Jeans,card,3,100,2,0",
                  ].join("\n"),
                );
                setName("pasted sample (5 rows incl. 1 invalid)");
              }}
            >
              Load 5-row sample
            </button>
            <button onClick={submit} disabled={busy} className="btn btn-primary">
              <Play size={14} /> {busy ? "Scoring batch…" : "Validate & score"}
            </button>
          </div>
          {csv && (
            <pre className="max-h-40 overflow-auto rounded-lg border hairline bg-abyss/70 p-3 text-[0.7rem] text-fog">{csv.slice(0, 2000)}{csv.length > 2000 ? "…" : ""}</pre>
          )}
          {fatal && <ErrorState message={fatal} />}
        </div>
      </Panel>

      {resp && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="panel rise p-4 text-center"><p className="num text-xl text-snow">{resp.summary.received}</p><p className="text-[0.65rem] uppercase tracking-widest text-fog">received</p></div>
            <div className="panel rise rise-1 p-4 text-center"><p className="num text-xl text-emeraldx">{resp.summary.accepted}</p><p className="text-[0.65rem] uppercase tracking-widest text-fog">accepted</p></div>
            <div className="panel rise rise-2 p-4 text-center"><p className="num text-xl text-rose-x">{resp.summary.rejected}</p><p className="text-[0.65rem] uppercase tracking-widest text-fog">rejected</p></div>
          </div>
          {resp.summary.warnings.length > 0 && (
            <p className="text-[0.72rem] text-amberx">Parser warnings: {resp.summary.warnings.join(", ")}</p>
          )}
          {resp.rejected.length > 0 && (
            <Panel title="Rejected rows — never silently discarded" className="rise rise-2">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[0.74rem]">
                  <thead>
                    <tr className="text-fog">
                      <th className="pb-2 pr-3 font-medium">Row</th>
                      <th className="pb-2 pr-3 font-medium">Reason rejected</th>
                      <th className="pb-2 font-medium">Original content</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resp.rejected.map((r) => (
                      <tr key={r.row} className="border-t hairline align-top">
                        <td className="num py-2 pr-3 text-rose-x">{r.row}</td>
                        <td className="py-2 pr-3 text-mist">{r.errors.join("; ")}</td>
                        <td className="num py-2 text-fog">{Object.values(r.original).join(" | ").slice(0, 140)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
          <Panel
            title="Row-level predictions"
            sub="Preview of first 300 — download for the full result"
            className="rise rise-3"
            right={<button onClick={download} className="btn btn-primary !py-1.5 text-[0.72rem]"><Download size={13} /> Download results CSV</button>}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[0.74rem]">
                <thead>
                  <tr className="text-fog">
                    <th className="pb-2 pr-3 font-medium">Case</th>
                    <th className="pb-2 pr-3 font-medium">Lang</th>
                    <th className="pb-2 pr-3 font-medium">Prediction</th>
                    <th className="pb-2 pr-3 font-medium">Routing</th>
                    <th className="pb-2 font-medium">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {resp.results.map((r) => (
                    <tr key={r.caseId} className="border-t hairline">
                      <td className="num py-2 pr-3 text-fog">#{r.row}</td>
                      <td className="py-2 pr-3"><span className="chip">{r.language}</span></td>
                      <td className="py-2 pr-3"><ClassBadge cls={r.predictedClass as never} /></td>
                      <td className="py-2 pr-3"><RoutingBadge routing={r.routing as never} /></td>
                      <td className="num py-2 text-mist">{(r.confidence * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function DemoLibrary() {
  const [active, setActive] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionFull | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (id: string) => {
    const c = DEMO_CASES.find((d) => d.id === id);
    if (!c) return;
    setActive(id);
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c.input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "failed");
      setResult(data);
    } catch {
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <Panel title="Ten judge scenarios" sub="Illustrative inputs — scored live by the model, no predetermined labels">
        <ul className="flex flex-col gap-1.5">
          {DEMO_CASES.map((d, i) => (
            <li key={d.id}>
              <button
                onClick={() => run(d.id)}
                className={`w-full rounded-lg border px-3 py-2.5 text-left transition-all ${
                  active === d.id ? "border-cyanx/50 bg-cyanx/10" : "border-line-soft bg-abyss/40 hover:border-line"
                }`}
              >
                <p className="text-[0.78rem] font-medium text-snow">
                  <span className="num mr-1.5 text-cyanx">{String(i + 1).padStart(2, "0")}</span>
                  {d.title}
                </p>
                <p className="mt-1 text-[0.68rem] leading-snug text-fog">{d.illustrates}</p>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      <div>
        {busy && <Panel><p className="text-[0.8rem] text-fog">Scoring scenario through the trained pipeline…</p></Panel>}
        {!busy && !result && (
          <Panel>
            <p className="text-[0.82rem] leading-relaxed text-fog">
              Select a scenario. Each runs through the real trained model — multilingual tokenizer, structured features,
              fusion layer, calibrated probabilities and cost-aware routing. Where evidence is missing (e.g. an
              unverifiable empty-box claim), the correct output is <span className="text-amberx">INSPECT / ESCALATE for verification</span>,
              not an accusation.
            </p>
          </Panel>
        )}
        {!busy && result && (
          <Panel className="rise" title={DEMO_CASES.find((d) => d.id === active)?.title}>
            <PredictionResult p={result} />
          </Panel>
        )}
      </div>
    </div>
  );
}
