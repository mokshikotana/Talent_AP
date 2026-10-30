"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, HeartPulse, Scale, ScanSearch, Ruler, ClipboardList } from "lucide-react";
import { DemoTag, EmptyState, ErrorState, KPI, Loading, PageHeader, Panel, fmtPct, useMode } from "@/components/ui";
import { HBars, RoutingDonut, Spark } from "@/components/charts";

interface Stats {
  dataSource: string;
  modelVersion: string | null;
  provisionalEvaluation: boolean;
  totals: {
    analyzed: number; autoApprove: number; inspect: number; escalate: number;
    avgExpectedCost: number; falsePositives: number; falseNegatives: number;
    uploads: number; live: number;
  };
  queue: { open_queue: number; pending: number; decided: number };
  monthly: number[];
  languages: Record<string, number>;
  model: { meanCost: number; accuracy: number; macroF1: number; balancedAccuracy: number; brier: number | null; reviewWorkloadPct: number | null } | null;
  baselines: Record<string, number> | null;
  fairnessFindings: string[];
  fit: { fit_cases: number; fit_products: number };
  splitNote: string | null;
}

interface Health {
  ok: boolean;
  db: string;
  model: { loaded: boolean; version?: string };
  data: { cases: number; customers: number; products: number; reviewActions: number } | null;
}

export default function CommandCenter() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { mode } = useMode();

  const load = () => {
    Promise.all([fetch(`/api/stats?mode=${mode}`), fetch("/api/health")])
      .then(async ([s, h]) => {
        if (!s.ok) throw new Error((await s.json()).message ?? "stats failed");
        setStats(await s.json());
        setHealth(await h.json());
      })
      .catch((e) => setError(e.message));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [mode]);

  return (
    <div>
      <PageHeader
        eyebrow="Command Center"
        title={
          <>
            Returns intelligence, <span className="text-gradient">explained</span>
          </>
        }
        description={
          mode === "demo"
            ? "One screen to understand everything: how many returns came in, where the system sent them, what mistakes it might make, and whether the AI is healthy. These numbers come from the built-in demo dataset — flip the top-right switch to “Your data” to work on your real returns."
            : "Your real data: returns you scored one-by-one or uploaded as CSV. Same honest dashboard, same explanations — now computed on your cases."
        }
        actions={mode === "demo" ? <DemoTag /> : <span className="chip border-tealx/40 bg-tealx/10 text-tealx">Your data (real mode)</span>}
      />

      {error && <ErrorState message={error} onRetry={() => { setError(null); load(); }} />}
      {!stats && !error && <Loading label="Aggregating live metrics…" />}

      {stats && mode === "real" && stats.totals.analyzed === 0 && (
        <EmptyState
          title="No real cases yet"
          hint="Open the Return Decision Engine — score one case manually, or upload a CSV (there is a 5-row sample to try). Every accepted row lands here."
        />
      )}

      {stats && !(mode === "real" && stats.totals.analyzed === 0) && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KPI label="Returns analyzed" value={stats.totals.analyzed.toLocaleString("en-IN")} sub={`${stats.totals.uploads} uploaded · ${stats.totals.live} live`} tone="plain" delay={1} />
            <KPI label="Auto-approve" value={stats.totals.autoApprove.toLocaleString("en-IN")} sub={fmtPct(stats.totals.autoApprove / Math.max(1, stats.totals.analyzed))} tone="emerald" delay={2} />
            <KPI label="Inspect" value={stats.totals.inspect.toLocaleString("en-IN")} sub={fmtPct(stats.totals.inspect / Math.max(1, stats.totals.analyzed))} tone="amber" delay={3} />
            <KPI label="Escalate" value={stats.totals.escalate.toLocaleString("en-IN")} sub={fmtPct(stats.totals.escalate / Math.max(1, stats.totals.analyzed))} tone="rose" delay={4} />
            <KPI label="Avg expected cost" value={stats.totals.avgExpectedCost.toFixed(3)} sub="routing units / case" tone="cyan" delay={1} />
            <KPI label="FP / FN (abuse class)" value={`${stats.totals.falsePositives.toLocaleString("en-IN")} / ${stats.totals.falseNegatives.toLocaleString("en-IN")}`} sub="genuine flagged / abuse missed" tone="violet" delay={2} />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <Panel title="Operational routing" sub="Expected-cost routing over the full dataset" className="rise rise-2">
              <RoutingDonut distribution={{ "AUTO-APPROVE": stats.totals.autoApprove, INSPECT: stats.totals.inspect, ESCALATE: stats.totals.escalate }} />
              <div className="mt-4 flex items-center justify-between border-t hairline pt-3">
                <span className="text-[0.72rem] text-fog">Open review queue</span>
                <Link href="/workbench" className="btn !py-1 text-[0.72rem]">
                  <ClipboardList size={13} /> {stats.queue.open_queue.toLocaleString("en-IN")} open
                </Link>
              </div>
            </Panel>

            <Panel title="Demand signal" sub="Monthly return request volume (12 months)" className="rise rise-3">
              <div className="pt-2">
                <Spark values={stats.monthly} height={110} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {Object.entries(stats.languages).slice(0, 3).map(([lang, c]) => (
                  <div key={lang} className="rounded-lg border hairline bg-abyss/50 px-2 py-1.5">
                    <p className="num text-[0.8rem] text-cyanx">{fmtPct(c / Math.max(1, stats.totals.analyzed), 0)}</p>
                    <p className="text-[0.62rem] uppercase tracking-widest text-fog">{lang}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel
              title="Model performance — fused"
              sub="Provisional cost-weighted objective on held-out test split"
              className="rise rise-4"
              right={<Link href="/evaluation" className="btn !py-1 text-[0.72rem]">Evaluation Lab <ArrowRight size={12} /></Link>}
            >
              {stats.model ? (
                <>
                  <HBars
                    rows={[
                      ...(stats.baselines
                        ? Object.entries(stats.baselines).map(([k, v]) => ({ label: `baseline: ${k}`, value: v, color: "rgba(166,156,138,0.55)" }))
                        : []),
                      { label: "fused model", value: stats.model.meanCost, color: "#5f7f6d" },
                    ]}
                    fmt={(v) => v.toFixed(3)}
                  />
                  <p className="mt-3 text-[0.68rem] leading-relaxed text-fog">
                    Lower mean cost is better. Macro-F1 {fmtPct(stats.model.macroF1)} · accuracy {fmtPct(stats.model.accuracy)} · Brier {stats.model.brier?.toFixed(3) ?? "—"} · review workload {stats.model.reviewWorkloadPct?.toFixed(1)}%
                  </p>
                </>
              ) : (
                <p className="text-[0.78rem] text-fog">Model artifact not loaded — run the seed &amp; train pipeline.</p>
              )}
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Panel title="Fairness watch" sub="Latest findings from the test-split audit" className="rise rise-2">
              <ul className="flex flex-col gap-2">
                {stats.fairnessFindings.map((f, i) => (
                  <li key={i} className="flex gap-2 text-[0.76rem] leading-relaxed text-mist">
                    <Scale size={12} className="mt-0.5 shrink-0 text-tealx" />
                    {f}
                  </li>
                ))}
                {stats.fairnessFindings.length === 0 && <li className="text-[0.75rem] text-fog">No audit computed yet.</li>}
              </ul>
              <Link href="/fairness" className="btn mt-4 !py-1.5 text-[0.72rem]">Fairness Observatory <ArrowRight size={12} /></Link>
            </Panel>

            <Panel title="Fit intelligence" sub="Genuine fit-return landscape" className="rise rise-3">
              <p className="num text-2xl font-semibold text-cyanx">{stats.fit.fit_cases.toLocaleString("en-IN")}</p>
              <p className="mt-1 text-[0.75rem] text-fog">
                genuine fit returns concentrated in {stats.fit.fit_products} products
              </p>
              <Link href="/fit" className="btn mt-4 !py-1.5 text-[0.72rem]">
                <Ruler size={12} /> Top-5 fit drivers <ArrowRight size={12} />
              </Link>
            </Panel>

            <Panel title="Data & model health" sub="Runtime status" className="rise rise-4">
              {health ? (
                <ul className="flex flex-col gap-2 text-[0.76rem]">
                  <li className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-mist"><HeartPulse size={13} className="text-tealx" /> PostgreSQL</span>
                    <span className={`chip ${health.db === "up" ? "border-emeraldx/40 text-emeraldx" : "border-rose-x/40 text-rose-x"}`}>{health.db}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-mist">Model artifact</span>
                    <span className={`chip ${health.model.loaded ? "border-emeraldx/40 text-emeraldx" : "border-amberx/40 text-amberx"}`}>
                      {health.model.loaded ? health.model.version : "not seeded"}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-mist">Evaluation contract</span>
                    <span className="chip border-amberx/40 text-amberx">provisional</span>
                  </li>
                </ul>
              ) : (
                <Loading label="Checking health…" />
              )}
              <Link href="/audit" className="btn mt-4 !py-1.5 text-[0.72rem]">Audit &amp; Health <ArrowRight size={12} /></Link>
            </Panel>
          </div>

          <Panel className="rise rise-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="h-display text-[0.95rem] font-semibold text-snow">Score a return right now</h2>
                <p className="mt-0.5 text-[0.75rem] text-fog">
                  Single case, CSV batch, or the ten-scenario judge walkthrough.
                </p>
              </div>
              <Link href="/engine" className="btn btn-primary">
                <ScanSearch size={14} /> Open Decision Engine
              </Link>
            </div>
          </Panel>
          <p className="px-1 text-[0.68rem] leading-relaxed text-fog/80">{stats.splitNote}</p>
        </div>
      )}
    </div>
  );
}
