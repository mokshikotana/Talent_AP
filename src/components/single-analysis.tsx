"use client";

import { useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { ErrorState, Panel } from "@/components/ui";
import { PredictionResult } from "@/components/predict";
import type { CaseInput, Prediction } from "@/lib/ml/labels";

export type PredictionFull = Prediction & { detectedLanguage: string; modelVersion: string; caseId?: string | null };

export const DEFAULT_FORM: Record<string, string> = {
  orderValue: "1899",
  quantity: "1",
  discountPct: "10",
  deliveryDays: "3",
  daysSinceDelivery: "6",
  paymentMethod: "card",
  category: "Jeans",
  region: "Bengaluru",
  customerTenureDays: "800",
  priorOrders12m: "12",
  priorReturns12m: "2",
  accountOrdersLifetime: "22",
  reasonText: "Too tight around the waist, ordered my usual size. Please exchange for one size bigger.",
};

export const FIELD_DEFS: { key: string; label: string; type: "number" | "select"; options?: string[]; hint?: string }[] = [
  { key: "orderValue", label: "Order value (₹) *", type: "number" },
  { key: "quantity", label: "Quantity", type: "number" },
  { key: "discountPct", label: "Discount %", type: "number" },
  { key: "deliveryDays", label: "Delivery days", type: "number" },
  { key: "daysSinceDelivery", label: "Days since delivery", type: "number", hint: "30-day return window" },
  { key: "customerTenureDays", label: "Customer tenure (days)", type: "number", hint: "blank = history unavailable" },
  { key: "priorOrders12m", label: "Prior orders (12m)", type: "number" },
  { key: "priorReturns12m", label: "Prior returns (12m)", type: "number" },
  { key: "accountOrdersLifetime", label: "Lifetime orders", type: "number" },
  { key: "paymentMethod", label: "Payment method", type: "select", options: ["card", "upi", "cod", "wallet", "unknown"] },
  { key: "category", label: "Category", type: "select", options: ["Jeans", "T-Shirts", "Shirts", "Dresses", "Kurtas", "Jackets", "Activewear", "Footwear", "Home & Living", "Accessories", "unknown"] },
  { key: "region", label: "Region", type: "select", options: ["Delhi NCR", "Mumbai", "Bengaluru", "Hyderabad", "Chennai", "Kolkata", "Pune", "Jaipur", "unknown"] },
];

export function formToInput(f: Record<string, string>): Record<string, unknown> {
  const num = (k: string) => (f[k].trim() === "" ? undefined : Number(f[k]));
  return {
    orderValue: num("orderValue"),
    quantity: num("quantity"),
    discountPct: num("discountPct"),
    deliveryDays: num("deliveryDays"),
    daysSinceDelivery: num("daysSinceDelivery"),
    paymentMethod: f.paymentMethod,
    category: f.category,
    region: f.region,
    customerTenureDays: num("customerTenureDays") ?? null,
    priorOrders12m: num("priorOrders12m") ?? null,
    priorReturns12m: num("priorReturns12m") ?? null,
    accountOrdersLifetime: num("accountOrdersLifetime") ?? null,
    reasonText: f.reasonText,
  };
}

export function SingleAnalysis({
  initial,
  persist = false,
  bare = false,
}: {
  initial?: CaseInput;
  persist?: boolean;
  bare?: boolean;
}) {
  const [form, setForm] = useState<Record<string, string>>(() =>
    initial
      ? Object.fromEntries(
          Object.entries(DEFAULT_FORM).map(([k, d]) => {
            const v = (initial as unknown as Record<string, unknown>)[k];
            return [k, v === null || v === undefined ? "" : String(v)];
          }),
        )
      : DEFAULT_FORM,
  );
  const [result, setResult] = useState<PredictionFull | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setErrors([]);
    setFatal(null);
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formToInput(form), persist }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.errors) setErrors(data.errors);
        else setFatal(data.message ?? "Prediction failed");
        return;
      }
      setResult(data);
    } catch (e) {
      setFatal(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Panel title="Case intake" sub="Fields left blank stay 'unknown' — the model handles missing history explicitly">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {FIELD_DEFS.map((fd) => (
            <label key={fd.key} className="block">
              <span className="mb-1 block text-[0.68rem] font-medium uppercase tracking-[0.1em] text-fog">{fd.label}</span>
              {fd.type === "select" ? (
                <select
                  className="input"
                  value={form[fd.key]}
                  onChange={(e) => setForm((f) => ({ ...f, [fd.key]: e.target.value }))}
                >
                  {fd.options!.map((o: string) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={fd.type}
                  className="input num"
                  value={form[fd.key]}
                  placeholder={fd.hint}
                  onChange={(e) => setForm((f) => ({ ...f, [fd.key]: e.target.value }))}
                />
              )}
            </label>
          ))}
        </div>
        <label className="mt-3 block">
          <span className="mb-1 block text-[0.68rem] font-medium uppercase tracking-[0.1em] text-fog">
            Customer reason — English, Hinglish or हिन्दी
          </span>
          <textarea
            className="input h-20 resize-y"
            value={form.reasonText}
            placeholder="e.g. size chota hai, exchange karna hai"
            onChange={(e) => setForm((f) => ({ ...f, reasonText: e.target.value }))}
          />
        </label>
        {errors.length > 0 && (
          <div className="mt-3 rounded-lg border border-rose-x/40 bg-rose-x/10 p-3" role="alert">
            <p className="mb-1 text-[0.75rem] font-semibold text-rose-x">Validation errors</p>
            <ul className="list-disc pl-4 text-[0.75rem] text-rose-x/90">
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={run} disabled={loading} className="btn btn-primary">
            <Play size={14} /> {loading ? "Scoring…" : "Run decision engine"}
          </button>
          <button onClick={() => { setForm(DEFAULT_FORM); setResult(null); }} className="btn">
            <RotateCcw size={13} /> Reset
          </button>
          {persist && <span className="text-[0.7rem] text-fog">Persisted to audit trail as source=live</span>}
        </div>
        {fatal && <div className="mt-3"><ErrorState message={fatal} /></div>}
      </Panel>
      {result && !bare && (
        <Panel className="rise" title="Decision output" right={result.caseId ? <span className="chip num">{result.caseId}</span> : undefined}>
          <PredictionResult p={result} />
        </Panel>
      )}
      {result && bare && <PredictionResult p={result} />}
    </div>
  );
}
