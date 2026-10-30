"use client";

import { useEffect, useState } from "react";
import { CalendarClock, ShieldAlert } from "lucide-react";
import { CLASS_META, CLASSES, type ReturnClass } from "@/lib/ml/labels";
import { DemoTag, ErrorState, KPI, Loading, PageHeader, Panel, fmtPct } from "@/components/ui";
import { ConfusionMatrix, HBars } from "@/components/charts";
import type { EvalReport } from "@/lib/ml/evaluator";

interface EvalData {
  version: string;
  trainedAt: string;
  seed: number;
  provisionalEvaluation: boolean;
  costGuidance: string;
  costMatrix: number[][];
  splitStrategy: string;
  dataset: { total: number; perClass: Record<string, number>; splits: Record<string, number>; customers: number; products: number };
  metrics: Record<string, EvalReport>;
  baselines: Record<string, EvalReport>;
  chronologyCheck: { note: string; earlyMeanCost: number; lateMeanCost: number; earlyN: number; lateN: number };
  temperatures: Record<string, number>;
}

export default function EvaluationPage() {
  const [d, setD] = useState<EvalData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () =>
    fetch("/api/reports?report=evaluation")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).message ?? "failed");
        return r.json();
      })
      .then(setD)
      .catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  if (err) return <div className="pt-4"><PageHeader eyebrow="Model Evaluation Lab" title="Cost-weighted truth" description="" /><ErrorState message={err} onRetry={() => { setErr(null); load(); }} /></div>;
  if (!d) return <div className="pt-4"><PageHeader eyebrow="Model Evaluation Lab" title="Cost-weighted truth" description="" /><Loading label="Loading computed metrics…" /></div>;

  const fused = d.metrics.fused;
  const costRows = [
    ...Object.entries(d.baselines).map(([k, v]) => ({ label: `baseline · ${k}`, value: v.meanCost, color: "rgba(166,156,138,0.5)" })),
    { label: "structured model", value: d.metrics.structured.meanCost, color: "#7d7396" },
    { label: "text model", value: d.metrics.text.meanCost, color: "#8b6f47" },
    { label: "fused model (deployed)", value: fused.meanCost, color: "#5f7f6d" },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Model Evaluation Lab"
        title="Cost-weighted truth"
        description="The primary objective is mean decision cost under the documented matrix — never raw accuracy. All metrics were computed by the training pipeline on the untouched test split and stored in the model artifact."
        actions={<DemoTag label="Provisional matrix · synthetic test split" />}
      />

      {d.provisionalEvaluation && (
        <div className="rise mb-5 flex items-start gap-3 rounded-xl border border-amberx/30 bg-amberx/10 p-4">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amberx" />
          <p className="text-[0.78rem] leading-relaxed text-amberx/90">
            {d.costGuidance} The adapter in <code className="num">src/lib/ml/evaluator.ts</code> is the
            replaceable integration point for the official <code className="num">evaluate.py</code> if supplied.
          </p>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPI label="Official-style mean cost" value={fused.meanCost.toFixed(4)} sub="lower is better" tone="cyan" delay={1} />
        <KPI label="Macro-F1" value={fmtPct(fused.macroF1)} sub={`balanced acc ${fmtPct(fused.balancedAccuracy)}`} tone="emerald" delay={2} />
        <KPI label="Brier score" value={fused.brier?.toFixed(4) ?? "—"} sub={`NLL ${fused.nll?.toFixed(3) ?? "—"}`} tone="violet" delay={3} />
        <KPI label="Review workload" value={`${fused.routing?.reviewWorkloadPct.toFixed(1) ?? "—"}%`} sub={`realized routing cost ${fused.routing?.meanRealizedRoutingCost.toFixed(3)}/case`} tone="amber" delay={4} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Cost-weighted objective — model comparison" sub="Mean cost per case on test split (n = baseline vs model arms)" className="rise rise-1">
          <HBars rows={costRows} fmt={(v) => v.toFixed(3)} />
          <p className="mt-3 text-[0.7rem] leading-relaxed text-fog">
            The fused model is deployed because it minimizes the cost objective on validation, not because it is the most
            complex. Confusion-driven rework (subclass errors) and the asymmetric 10× wrongful-suspicion penalty dominate the score.
          </p>
        </Panel>

        <Panel title="Confusion matrix — fused, test split" sub="Rows: ground truth · Columns: prediction" className="rise rise-2">
          <ConfusionMatrix matrix={fused.confusion} />
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Per-class metrics — fused" sub="Precision / recall / F1 on the test split" className="rise rise-2">
          <table className="w-full text-left text-[0.76rem]">
            <thead>
              <tr className="text-fog">
                <th className="pb-2 font-medium">Class</th>
                <th className="pb-2 font-medium">Precision</th>
                <th className="pb-2 font-medium">Recall</th>
                <th className="pb-2 font-medium">F1</th>
                <th className="pb-2 text-right font-medium">Support</th>
              </tr>
            </thead>
            <tbody>
              {CLASSES.map((c) => {
                const m = fused.perClass[c];
                return (
                  <tr key={c} className="border-t hairline">
                    <td className="py-2" style={{ color: CLASS_META[c].color }}>{CLASS_META[c].short}</td>
                    <td className="num py-2 text-mist">{fmtPct(m.precision)}</td>
                    <td className="num py-2 text-mist">{fmtPct(m.recall)}</td>
                    <td className="num py-2 text-mist">{fmtPct(m.f1)}</td>
                    <td className="num py-2 text-right text-fog">{m.support.toLocaleString("en-IN")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="num mt-3 text-[0.68rem] text-fog">
            routing distribution: AUTO-APPROVE {fused.routing?.distribution["AUTO-APPROVE"].toLocaleString("en-IN")} ·
            INSPECT {fused.routing?.distribution.INSPECT.toLocaleString("en-IN")} ·
            ESCALATE {fused.routing?.distribution.ESCALATE.toLocaleString("en-IN")}
          </p>
        </Panel>

        <Panel title="Calibration & robustness" sub="Temperature scaling fitted on validation only" className="rise rise-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            {Object.entries(d.temperatures).map(([k, t]) => (
              <div key={k} className="rounded-lg border hairline bg-abyss/50 p-3">
                <p className="num text-lg text-cyanx">{t}</p>
                <p className="text-[0.62rem] uppercase tracking-widest text-fog">{k} temp</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border hairline bg-abyss/50 p-3.5">
            <p className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-mist">
              <CalendarClock size={12} className="text-tealx" /> Chronology robustness check
            </p>
            <p className="mt-1.5 text-[0.74rem] leading-relaxed text-fog">{d.chronologyCheck.note}</p>
            <p className="num mt-2 text-[0.78rem] text-mist">
              months 0–8: {d.chronologyCheck.earlyMeanCost.toFixed(4)} (n={d.chronologyCheck.earlyN.toLocaleString("en-IN")}) ·
              months 9–11: {d.chronologyCheck.lateMeanCost.toFixed(4)} (n={d.chronologyCheck.lateN.toLocaleString("en-IN")})
            </p>
          </div>
          <div className="mt-3 rounded-lg border hairline bg-abyss/50 p-3.5">
            <p className="text-[0.72rem] font-semibold text-mist">Leakage controls</p>
            <p className="mt-1.5 text-[0.72rem] leading-relaxed text-fog">{d.splitStrategy}</p>
            <p className="num mt-2 text-[0.68rem] text-fog/80">artifact {d.version} · seed {d.seed} · trained {new Date(d.trainedAt).toLocaleString("en-IN")}</p>
          </div>
        </Panel>
      </div>

      <Panel title="Provisional cost matrix" sub="cost[true][pred] — replace with the official matrix when supplied" className="mt-5 rise rise-4">
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-1 text-[0.72rem]">
            <thead>
              <tr>
                <th className="pr-2 text-right text-[0.65rem] font-normal text-fog">true → pred</th>
                {CLASSES.map((c) => (
                  <th key={c} className="px-1 font-medium" style={{ color: CLASS_META[c].color }}>{CLASS_META[c].short}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.costMatrix.map((row, i) => (
                <tr key={i}>
                  <th className="pr-2 text-right font-medium" style={{ color: CLASS_META[CLASSES[i]].color }}>{CLASS_META[CLASSES[i]].short}</th>
                  {row.map((v, j) => (
                    <td key={j} className={`num h-9 w-20 rounded-lg text-center ${v === 0 ? "bg-tealx/15 text-tealx" : v >= 10 ? "bg-rose-x/20 text-rose-x" : "bg-raise text-mist"}`}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-2 text-[0.72rem] text-fog sm:grid-cols-3">
          <p><span className="text-mist">Dataset:</span> {d.dataset.total.toLocaleString("en-IN")} cases · {d.dataset.customers.toLocaleString("en-IN")} customers · {d.dataset.products} products</p>
          <p><span className="text-mist">Class mix:</span> {Object.entries(d.dataset.perClass).map(([k, v]) => `${CLASS_META[k as ReturnClass].short} ${v.toLocaleString("en-IN")}`).join(" · ")}</p>
          <p><span className="text-mist">Splits:</span> train {d.dataset.splits.train.toLocaleString("en-IN")} · val {d.dataset.splits.val.toLocaleString("en-IN")} · test {d.dataset.splits.test.toLocaleString("en-IN")} (customer-grouped)</p>
        </div>
      </Panel>
    </div>
  );
}
