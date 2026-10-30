"use client";

import { useEffect, useState } from "react";
import { Microscope } from "lucide-react";
import { CLASS_META, CLASSES, type ReturnClass } from "@/lib/ml/labels";
import { ErrorState, Loading, PageHeader, Panel } from "@/components/ui";
import { SingleAnalysis } from "@/components/single-analysis";

interface GlobalExplain {
  textTopTokens: { class: ReturnClass; tokens: { feature: string; weight: number }[] }[];
  structTop: { class: ReturnClass; features: { name: string; w: number }[] }[];
}

export default function ExplainabilityPage() {
  const [gx, setGx] = useState<GlobalExplain | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cls, setCls] = useState<ReturnClass>("abusive");

  useEffect(() => {
    fetch("/api/reports?report=evaluation")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).message ?? "failed");
        return r.json();
      })
      .then((d) => setGx(d.globalExplain))
      .catch((e) => setErr(e.message));
  }, []);

  const tokenBlock = gx?.textTopTokens.find((t) => t.class === cls);
  const structBlock = gx?.structTop.find((t) => t.class === cls);

  return (
    <div>
      <PageHeader
        eyebrow="Explainability Studio"
        title="Evidence, not vibes"
        description="Two layers of transparency: global model introspection (what the trained weights actually learned) and per-case explanations (exact linear term contributions — never post-hoc storytelling)."
        actions={<span className="chip"><Microscope size={11} /> linear-model contributions, faithful by construction</span>}
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <div>
          <Panel title="Global model introspection" sub="Strongest learned signals per class, by absolute weight">
            <div className="mb-4 flex flex-wrap gap-1.5">
              {CLASSES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCls(c)}
                  className="btn !py-1.5 text-[0.72rem]"
                  style={
                    cls === c
                      ? { borderColor: CLASS_META[c].color, color: CLASS_META[c].color, background: `${CLASS_META[c].color}14` }
                      : undefined
                  }
                >
                  {CLASS_META[c].short}
                </button>
              ))}
            </div>
            {err && <ErrorState message={err} />}
            {!gx && !err && <Loading label="Reading trained weights…" />}
            {gx && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-fog">Text signals (TF-IDF)</p>
                  <ul className="flex flex-col gap-1">
                    {tokenBlock?.tokens.map((t, i) => (
                      <li key={i} className="flex items-center justify-between rounded-md bg-abyss/60 px-2.5 py-1.5">
                        <span className="text-[0.74rem] text-mist">{t.feature}</span>
                        <span className="num text-[0.7rem]" style={{ color: t.weight > 0 ? "#5f7f6d" : "#a05e57" }}>
                          {t.weight > 0 ? "+" : ""}{t.weight}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-fog">Structured signals</p>
                  <ul className="flex flex-col gap-1">
                    {structBlock?.features.map((t, i) => (
                      <li key={i} className="flex items-center justify-between rounded-md bg-abyss/60 px-2.5 py-1.5">
                        <span className="text-[0.74rem] text-mist">{t.name}</span>
                        <span className="num text-[0.7rem]" style={{ color: t.w > 0 ? "#5f7f6d" : "#a05e57" }}>
                          {t.w > 0 ? "+" : ""}{t.w}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <p className="mt-4 border-t hairline pt-3 text-[0.7rem] leading-relaxed text-fog">
              Language and customer-history-absence are not fraud inputs by policy — verify above that no language token
              dominates the abusive class. The audit trail (Fairness Observatory) checks outcomes empirically.
            </p>
          </Panel>
        </div>
        <div>
          <h2 className="h-display mb-3 text-[0.95rem] font-semibold text-snow">Per-case explanation playground</h2>
          <SingleAnalysis bare />
        </div>
      </div>
    </div>
  );
}
