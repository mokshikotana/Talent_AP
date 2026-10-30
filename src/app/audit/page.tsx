"use client";

import { useEffect, useState } from "react";
import { Activity, HeartPulse, Lock, RefreshCw, Server } from "lucide-react";
import { ErrorState, Loading, PageHeader, Panel, RoutingBadge } from "@/components/ui";

interface Health {
  ok: boolean;
  db: string;
  latencyMs: number;
  model: { loaded: boolean; version?: string; dataSource?: string; reason?: string };
  data: { cases: number; customers: number; products: number; reviewActions: number } | null;
  env: { databaseUrl: boolean };
  time: string;
}

interface AuditRow {
  id: number;
  case_id: string;
  action: string;
  actor: string;
  detail: string;
  model_version: string | null;
  original_routing: string | null;
  created_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  approve: "#54705f",
  "override-auto-approve": "#5f7f6d",
  "override-escalate": "#a05e57",
  pending: "#96684a",
  "evidence-request": "#8b6f47",
  outcome: "#7d7396",
};

export default function AuditPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setErr(null);
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch((e) => setErr(e.message));
    fetch("/api/review?view=audit&limit=60").then(async (r) => {
      if (!r.ok) throw new Error("audit fetch failed");
      return r.json();
    }).then((d) => setAudit(d.rows)).catch((e) => setErr(e.message));
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader
        eyebrow="Audit & System Health"
        title="Every decision leaves a trail"
        description="Human overrides, evidence requests and outcomes are immutable audit records with actor, timestamp and model version. System health is checked live against PostgreSQL and the model artifact."
        actions={<button onClick={load} className="btn"><RefreshCw size={13} /> Refresh</button>}
      />
      {err && <ErrorState message={err} onRetry={load} />}

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <Panel className="rise rise-1">
          <div className="flex items-center gap-2.5">
            <span className={`grid h-9 w-9 place-items-center rounded-lg ${health?.db === "up" ? "bg-emeraldx/15" : "bg-rose-x/15"}`}>
              <HeartPulse size={16} className={health?.db === "up" ? "text-emeraldx" : "text-rose-x"} />
            </span>
            <div>
              <p className="text-[0.8rem] font-semibold text-snow">PostgreSQL</p>
              <p className="num text-[0.65rem] text-fog">{health ? `${health.db} · ${health.latencyMs}ms` : "checking…"}</p>
            </div>
            <span className={`ml-auto h-2 w-2 rounded-full ${health?.db === "up" ? "bg-emeraldx pulse-dot" : "bg-rose-x"}`} />
          </div>
          {health?.data && (
            <div className="num mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[0.7rem] text-fog">
              <span>return cases</span><span className="text-right text-mist">{health.data.cases.toLocaleString("en-IN")}</span>
              <span>customers</span><span className="text-right text-mist">{health.data.customers.toLocaleString("en-IN")}</span>
              <span>products</span><span className="text-right text-mist">{health.data.products}</span>
              <span>audit records</span><span className="text-right text-mist">{health.data.reviewActions.toLocaleString("en-IN")}</span>
            </div>
          )}
        </Panel>

        <Panel className="rise rise-2">
          <div className="flex items-center gap-2.5">
            <span className={`grid h-9 w-9 place-items-center rounded-lg ${health?.model.loaded ? "bg-emeraldx/15" : "bg-amberx/15"}`}>
              <Server size={16} className={health?.model.loaded ? "text-emeraldx" : "text-amberx"} />
            </span>
            <div>
              <p className="text-[0.8rem] font-semibold text-snow">Model artifact</p>
              <p className="num text-[0.65rem] text-fog">{health?.model.loaded ? health.model.version : "not loaded"}</p>
            </div>
          </div>
          <p className="mt-3 text-[0.7rem] leading-relaxed text-fog">
            {health?.model.loaded
              ? `In-memory scoring from artifacts/model.json (${health.model.dataSource}). Regenerate with the seed & train script.`
              : health?.model.reason ?? "Checking…"}
          </p>
        </Panel>

        <Panel className="rise rise-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-cyanx/15">
              <Lock size={16} className="text-cyanx" />
            </span>
            <div>
              <p className="text-[0.8rem] font-semibold text-snow">Security posture</p>
              <p className="num text-[0.65rem] text-fog">server-side secrets only</p>
            </div>
          </div>
          <ul className="mt-3 flex flex-col gap-1 text-[0.7rem] text-fog">
            <li>· DATABASE_URL read server-side: <span className={health?.env.databaseUrl ? "text-emeraldx" : "text-rose-x"}>{health?.env.databaseUrl ? "configured" : "missing"}</span></li>
            <li>· No model weights or hidden data exposed via public endpoints</li>
            <li>· Uploaded CSV capped (1,500 rows / 2 MB), inputs validated &amp; sanitized</li>
            <li>· Unverified model scores cannot deny a return — humans decide</li>
          </ul>
        </Panel>
      </div>

      <Panel title="Audit trail" sub="Most recent human review actions — model predictions remain untouched">
        {!audit ? (
          <Loading label="Loading audit trail…" />
        ) : audit.length === 0 ? (
          <p className="text-[0.78rem] text-fog">No human actions recorded yet. Use the Workbench to approve, override or escalate a case.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.74rem]">
              <thead>
                <tr className="text-fog">
                  <th className="pb-2 pr-3 font-medium">#</th>
                  <th className="pb-2 pr-3 font-medium">Case</th>
                  <th className="pb-2 pr-3 font-medium">Action</th>
                  <th className="pb-2 pr-3 font-medium">Model said</th>
                  <th className="pb-2 pr-3 font-medium">Actor</th>
                  <th className="pb-2 pr-3 font-medium">Reason / detail</th>
                  <th className="pb-2 pr-3 font-medium">Model ver.</th>
                  <th className="pb-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-t hairline align-top">
                    <td className="num py-2 pr-3 text-fog">{a.id}</td>
                    <td className="num py-2 pr-3 text-mist">{a.case_id}</td>
                    <td className="py-2 pr-3">
                      <span className="chip" style={{ color: ACTION_COLORS[a.action] ?? "#8ca3c3", borderColor: `${ACTION_COLORS[a.action] ?? "#8ca3c3"}55`, background: `${ACTION_COLORS[a.action] ?? "#8ca3c3"}14` }}>
                        {a.action}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{a.original_routing ? <RoutingBadge routing={a.original_routing as never} /> : <span className="text-fog">—</span>}</td>
                    <td className="py-2 pr-3 text-mist">{a.actor}</td>
                    <td className="max-w-[260px] py-2 pr-3 text-fog">{a.detail || <i className="text-fog/60">—</i>}</td>
                    <td className="num py-2 pr-3 text-fog">{a.model_version ?? "—"}</td>
                    <td className="num py-2 text-fog">{new Date(a.created_at).toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Compliance notes" className="mt-5 rise rise-2">
        <div className="grid gap-3 text-[0.75rem] leading-relaxed text-fog md:grid-cols-3">
          <p><span className="text-snow">Human-in-the-loop.</span> The model emits operational recommendations (AUTO-APPROVE / INSPECT / ESCALATE), never verdicts. Overrides require a recorded reason and are logged with the original model output intact.</p>
          <p><span className="text-snow">Honesty by construction.</span> Demo data is labeled as demo; the evaluation contract is labeled provisional; calibration temperatures, split strategy and leakage controls ship inside the artifact and render in the Evaluation Lab.</p>
          <p><span className="text-snow">Data boundaries.</span> Customer text is treated as untrusted input (sanitized, length-capped). Language detection informs service quality and fairness audits — it is not a fraud feature by policy.</p>
        </div>
        <p className="mt-4 flex items-center gap-2 text-[0.7rem] text-fog">
          <Activity size={12} className="text-tealx" /> Health snapshot generated {health ? new Date(health.time).toLocaleString("en-IN") : "…"}
        </p>
      </Panel>
    </div>
  );
}
