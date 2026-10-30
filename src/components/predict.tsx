"use client";

import { CheckCircle2, CircleAlert, Info, ListChecks, ShieldQuestion } from "lucide-react";
import { CLASS_META, type Prediction, type Routing } from "@/lib/ml/labels";
import { ClassBadge, RoutingBadge, fmtPct } from "@/components/ui";
import { ProbBars } from "@/components/charts";

function EvidenceList({
  title,
  items,
  icon,
  tone,
}: {
  title: string;
  items: string[];
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="rounded-xl border hairline bg-abyss/50 p-3.5">
      <p className="mb-2 flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em]" style={{ color: tone }}>
        {icon} {title}
      </p>
      {items.length === 0 ? (
        <p className="text-[0.75rem] italic text-fog/70">None — the available evidence does not produce any.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((s, i) => (
            <li key={i} className="flex gap-2 text-[0.78rem] leading-relaxed text-mist">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: tone }} />
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PredictionResult({ p, title }: { p: Prediction & { detectedLanguage?: string; modelVersion?: string }; title?: string }) {
  const isFallback = p.modelVersion?.includes("heuristic");
  const ec = p.expectedCostByAction;
  const maxEc = Math.max(ec["AUTO-APPROVE"], ec.INSPECT, ec.ESCALATE, 0.001);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {title && <h3 className="h-display mr-1 text-[0.95rem] font-semibold text-snow">{title}</h3>}
        <ClassBadge cls={p.predictedClass} />
        <RoutingBadge routing={p.routing} />
        <span className="chip" title="Language detected from the reason text (service + fairness use only, never a fraud signal)">
          {p.detectedLanguage === "hi" ? "हिन्दी text" : p.detectedLanguage ?? "unknown"}
        </span>
        <span className="chip num">confidence {fmtPct(p.confidence)}</span>
        {isFallback && (
          <span className="chip border-amberx/40 bg-amberx/10 text-amberx">heuristic fallback — model not seeded</span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <p className="mb-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-fog">
            Four-class probability (calibrated)
          </p>
          <ProbBars probs={p.probs} predicted={p.predictedClass} />
          {!isFallback && (
            <div className="mt-4 border-t hairline pt-3">
              <p className="mb-2 text-[0.68rem] uppercase tracking-[0.14em] text-fog">Base models</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-[0.65rem] text-fog/80">Structured</p>
                  <ProbBars probs={p.perModel.structured} compact />
                </div>
                <div>
                  <p className="mb-1 text-[0.65rem] text-fog/80">Text</p>
                  <ProbBars probs={p.perModel.text} compact />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="panel p-4">
            <p className="mb-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-fog">
              Expected cost per action (operational)
            </p>
            {(["AUTO-APPROVE", "INSPECT", "ESCALATE"] as Routing[]).map((r) => (
              <div key={r} className="mb-2 flex items-center gap-2 last:mb-0">
                <span className="w-28 text-[0.7rem] text-fog">{r}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-raise">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(ec[r] / maxEc) * 100}%`,
                      background: r === p.routing ? "#5f7f6d" : "rgba(166,156,138,0.4)",
                    }}
                  />
                </div>
                <span className="num w-12 text-right text-[0.7rem] text-mist">{ec[r].toFixed(3)}</span>
              </div>
            ))}
            <p className="mt-3 border-t hairline pt-3 text-[0.75rem] leading-relaxed text-fog">
              <Info size={12} className="mr-1 inline text-cyanx" />
              {p.explanation.recommendedAction}
            </p>
          </div>
          <div className="panel p-4">
            <p className="mb-1.5 flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-violetx">
              <ShieldQuestion size={12} /> Model agreement
            </p>
            <p className="text-[0.78rem] leading-relaxed text-mist">{p.explanation.modelAgreement}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <EvidenceList title="Observed facts" items={p.explanation.facts} icon={<ListChecks size={12} />} tone="#8b6f47" />
        <EvidenceList title={`Supports “${CLASS_META[p.predictedClass].short}”`} items={p.explanation.supporting} icon={<CheckCircle2 size={12} />} tone="#5f7f6d" />
        <EvidenceList title="Opposing evidence" items={p.explanation.opposing} icon={<ShieldQuestion size={12} />} tone="#96684a" />
        <EvidenceList title="Missing information" items={p.explanation.missing} icon={<CircleAlert size={12} />} tone="#a05e57" />
      </div>
    </div>
  );
}
