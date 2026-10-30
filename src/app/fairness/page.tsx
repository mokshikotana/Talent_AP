"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { DemoTag, ErrorState, Loading, PageHeader, Panel, fmtPct } from "@/components/ui";
import { HBars } from "@/components/charts";
import type { FairnessReportSection } from "@/lib/ml/fairness";

interface FairnessData {
  version: string;
  evaluatedOn: string;
  sections: FairnessReportSection[];
  languages: Record<string, number>;
  disclaimer: string;
}

const fmt = (v: number | null) => (v === null ? "n/a" : fmtPct(v));

export default function FairnessPage() {
  const [d, setD] = useState<FairnessData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () =>
    fetch("/api/reports?report=fairness")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).message ?? "failed");
        return r.json();
      })
      .then(setD)
      .catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader
        eyebrow="Fairness Observatory"
        title="Audit before trust"
        description="Three required groupings — customer tenure, order value, and language. Comparable routing rates are not treated as proof of fairness; error-rate parity (wrongful-suspicion FPR and missed-abuse FNR) is reported with Wilson 95% intervals."
        actions={<DemoTag label="Computed on held-out test split" />}
      />
      {err && <ErrorState message={err} onRetry={() => { setErr(null); load(); }} />}
      {!d && !err && <Loading label="Loading fairness audit…" />}
      {d && (
        <div className="flex flex-col gap-5">
          <div className="rise flex items-start gap-3 rounded-xl border border-cyanx/25 bg-cyanx/5 p-4">
            <ShieldAlert size={15} className="mt-0.5 shrink-0 text-cyanx" />
            <p className="text-[0.76rem] leading-relaxed text-mist">{d.disclaimer}</p>
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            {d.sections.map((s, si) => (
              <Panel key={s.id} title={s.title} sub={s.thresholdNote} className={`rise rise-${si + 1}`}>
                <p className="mb-4 text-[0.72rem] leading-relaxed text-fog">{s.description}</p>
                <div className="flex flex-col gap-4">
                  {s.groups.map((g) => (
                    <div key={g.key} className="rounded-xl border hairline bg-abyss/50 p-3.5">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[0.78rem] font-semibold text-snow">{g.label}</p>
                        <span className="num text-[0.65rem] text-fog">n={g.n.toLocaleString("en-IN")}</span>
                      </div>
                      <HBars
                        rows={[
                          { label: "auto-approve", value: g.routingRates["AUTO-APPROVE"], color: "#54705f" },
                          { label: "inspect", value: g.routingRates.INSPECT, color: "#96684a" },
                          { label: "escalate", value: g.routingRates.ESCALATE, color: "#a05e57" },
                        ]}
                        max={1}
                        fmt={(v) => fmtPct(v)}
                      />
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[0.7rem]">
                        <div className="rounded-md bg-raise/60 p-2">
                          <p className="text-fog">Wrongful-suspicion FPR</p>
                          <p className="num text-[0.8rem] text-rose-x">{fmt(g.fprAbusive)}</p>
                          {g.ci.fpr95 && (
                            <p className="num text-[0.62rem] text-fog/80">
                              95% CI [{fmtPct(g.ci.fpr95[0])}–{fmtPct(g.ci.fpr95[1])}]
                            </p>
                          )}
                        </div>
                        <div className="rounded-md bg-raise/60 p-2">
                          <p className="text-fog">Missed-abuse FNR</p>
                          <p className="num text-[0.8rem] text-amberx">{fmt(g.fnrAbusive)}</p>
                          <p className="num text-[0.62rem] text-fog/80">
                            precision {fmt(g.precisionAbusive)} · recall {fmt(g.recallAbusive)}
                          </p>
                        </div>
                      </div>
                      {g.meanCost !== null && (
                        <p className="num mt-2 text-[0.65rem] text-fog">mean realized routing cost {g.meanCost.toFixed(3)} / case</p>
                      )}
                      {g.smallSampleWarning && (
                        <p className="mt-2 rounded border border-amberx/30 bg-amberx/10 px-2 py-1 text-[0.66rem] text-amberx">
                          {g.smallSampleWarning}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-4 border-t hairline pt-3">
                  <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-tealx">Findings</p>
                  <ul className="flex flex-col gap-1">
                    {s.findings.map((f, i) => (
                      <li key={i} className="text-[0.72rem] leading-relaxed text-mist">· {f}</li>
                    ))}
                  </ul>
                </div>
              </Panel>
            ))}
          </div>

          <Panel title="Language landscape" sub="Detected language mix across the demo dataset — Hinglish and Devanagari are first-class inputs">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Object.entries(d.languages).map(([lang, c]) => (
                <div key={lang} className="rounded-xl border hairline bg-abyss/50 p-3.5 text-center">
                  <p className="num text-lg text-cyanx">{c.toLocaleString("en-IN")}</p>
                  <p className="text-[0.65rem] uppercase tracking-widest text-fog">{lang}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[0.72rem] leading-relaxed text-fog">
              Evaluation cohort: {d.evaluatedOn} · artifact {d.version}. Mitigation policy: language never feeds the routing
              decision directly; when gaps appear, thresholds are tuned per-group on validation only and re-audited here.
            </p>
          </Panel>
        </div>
      )}
    </div>
  );
}
