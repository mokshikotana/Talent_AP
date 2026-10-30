"use client";

import { useEffect, useState } from "react";
import { Database, Download, TerminalSquare } from "lucide-react";
import { DemoTag, ErrorState, Loading, PageHeader, Panel } from "@/components/ui";

interface RunRow {
  id: number;
  version: string;
  kind: string;
  data_source: string;
  metrics: { meanCost: number; macroF1: number; accuracy: number; n: number };
  created_at: string;
}

interface CaseRow {
  id: string;
  order_value: number;
  sku_category: string;
  reason_text: string;
  detected_language: string;
  label: string | null;
  predicted_class: string | null;
  routing: string | null;
  split: string;
}

const SCHEMA_DOCS: { field: string; type: string; desc: string }[] = [
  { field: "order_value", type: "number, required", desc: "Order total in ₹ (1 paise … 50 lakh cap)." },
  { field: "quantity", type: "int, default 1", desc: "Items in the order, 1–50." },
  { field: "discount_pct", type: "number, default 0", desc: "Discount depth 0–95." },
  { field: "delivery_days", type: "int, default 0", desc: "Shipping time in days, 0–60." },
  { field: "days_since_delivery", type: "int, default 0", desc: "When the return was raised, 0–365." },
  { field: "payment_method", type: "enum", desc: "card | upi | cod | wallet | unknown." },
  { field: "category", type: "enum", desc: "Product category (10 catalogue values; 'unknown' tolerated)." },
  { field: "region", type: "enum", desc: "Delivery region; unknown tolerated." },
  { field: "customer_tenure_days", type: "int|null", desc: "null = history unavailable (explicitly modeled, never punished)." },
  { field: "prior_orders_12m / prior_returns_12m", type: "int|null", desc: "Behavioral history; null when unavailable." },
  { field: "account_orders_lifetime", type: "int|null", desc: "Lifetime orders." },
  { field: "reason_text", type: "string ≤2000", desc: "Free text, English / Hinglish / Devanagari; treated as untrusted input." },
];

export default function DataPage() {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [preview, setPreview] = useState<CaseRow[] | null>(null);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    fetch("/api/review?view=runs").then(async (r) => { if (!r.ok) throw new Error("runs failed"); return r.json(); }).then((d) => setRuns(d.rows)).catch((e) => setErr(e.message));
    fetch("/api/cases?split=train&limit=8&sort=expected_cost&dir=desc").then((r) => r.json()).then((d) => setPreview(d.rows)).catch((e) => setErr(e.message));
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const downloadTemplate = () => {
    const csv = [
      "order_id,customer_id,product_id,order_value,quantity,discount_pct,delivery_days,days_since_delivery,payment_method,category,region,customer_tenure_days,prior_orders_12m,prior_returns_12m,account_orders_lifetime,reason_text",
      "ORD-1001,CU-77,PR-0001,1899,1,10,3,4,card,Jeans,Bengaluru,900,12,2,22,Too tight around the waist — exchange for one size bigger",
      "ORD-1002,CU-88,PR-0020,999,1,0,5,2,upi,T-Shirts,Pune,,,,,size chota hai, next size bhejo",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "returnguard-ingestion-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const modelInfo = health?.model as { loaded?: boolean; version?: string; trainedAt?: string } | undefined;

  return (
    <div>
      <PageHeader
        eyebrow="Data & Model Management"
        title="Where data and models come from"
        description="Full provenance: the synthetic demo generator, the replaceable ingestion contract, model artifacts, training runs, and the commands that reproduce everything."
        actions={<DemoTag />}
      />
      {err && <ErrorState message={err} onRetry={() => { setErr(null); load(); }} />}

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Ingestion contract" sub="The official dataset plugs in here when supplied — no code changes needed">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.74rem]">
              <thead>
                <tr className="text-fog">
                  <th className="pb-2 pr-3 font-medium">Field</th>
                  <th className="pb-2 pr-3 font-medium">Type</th>
                  <th className="pb-2 font-medium">Contract</th>
                </tr>
              </thead>
              <tbody>
                {SCHEMA_DOCS.map((s) => (
                  <tr key={s.field} className="border-t hairline align-top">
                    <td className="num py-2 pr-3 text-cyanx">{s.field}</td>
                    <td className="py-2 pr-3 text-fog">{s.type}</td>
                    <td className="py-2 text-mist">{s.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={downloadTemplate} className="btn mt-4">
            <Download size={13} /> Download CSV template
          </button>
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel title="Reproducible pipeline" sub="Deterministic seed 42">
            <div className="rounded-lg border hairline bg-abyss/70 p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-widest text-fog">
                <TerminalSquare size={12} className="text-cyanx" /> Commands
              </p>
              <pre className="num overflow-x-auto text-[0.72rem] leading-relaxed text-tealx">
{`# apply schema
npx drizzle-kit push

# generate data, train, evaluate, persist
npx tsx scripts/seed-and-train.ts

# run tests
npx tsx --test tests/returnguard.test.ts`}
              </pre>
            </div>
            <p className="num mt-3 text-[0.68rem] text-fog">
              artifact: artifacts/model.json · version: {modelInfo?.loaded ? modelInfo.version : "not loaded"} {modelInfo?.trainedAt ? `· trained ${new Date(modelInfo.trainedAt).toLocaleString("en-IN")}` : ""}
            </p>
          </Panel>

          <Panel title="Model registry" sub="Persisted training runs">
            {!runs ? (
              <Loading label="Loading runs…" />
            ) : (
              <table className="w-full text-left text-[0.74rem]">
                <thead>
                  <tr className="text-fog">
                    <th className="pb-2 font-medium">Kind</th>
                    <th className="pb-2 font-medium">Data</th>
                    <th className="pb-2 font-medium">Mean cost</th>
                    <th className="pb-2 font-medium">Macro-F1</th>
                    <th className="pb-2 text-right font-medium">n</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-t hairline">
                      <td className="py-2 text-snow">{r.kind}</td>
                      <td className="py-2 text-fog">{r.data_source}</td>
                      <td className="num py-2 text-cyanx">{r.metrics.meanCost.toFixed(4)}</td>
                      <td className="num py-2 text-mist">{(r.metrics.macroF1 * 100).toFixed(1)}%</td>
                      <td className="num py-2 text-right text-fog">{r.metrics.n.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Dataset preview (train split)" sub="Highest expected-cost rows first — labels visible because demo data is labeled" className="mt-5">
        {!preview ? (
          <Loading label="Loading preview…" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.72rem]">
              <thead>
                <tr className="text-fog">
                  <th className="pb-2 pr-3 font-medium">Case</th>
                  <th className="pb-2 pr-3 font-medium">Category</th>
                  <th className="pb-2 pr-3 font-medium">Value</th>
                  <th className="pb-2 pr-3 font-medium">Lang</th>
                  <th className="pb-2 pr-3 font-medium">Label (demo truth)</th>
                  <th className="pb-2 pr-3 font-medium">Pred → routing</th>
                  <th className="pb-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((c) => (
                  <tr key={c.id} className="border-t hairline align-top">
                    <td className="num py-2 pr-3 text-fog">{c.id}</td>
                    <td className="py-2 pr-3 text-mist">{c.sku_category}</td>
                    <td className="num py-2 pr-3 text-mist">₹{Math.round(c.order_value).toLocaleString("en-IN")}</td>
                    <td className="py-2 pr-3"><span className="chip">{c.detected_language}</span></td>
                    <td className="py-2 pr-3 text-fog">{c.label}</td>
                    <td className="py-2 pr-3 text-mist">{c.predicted_class} → <b className="text-cyanx">{c.routing}</b></td>
                    <td className="max-w-[320px] py-2 text-fog">{c.reason_text.slice(0, 110) || <i>—</i>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
