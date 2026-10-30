"use client";

import { useEffect, useState } from "react";
import { Ruler } from "lucide-react";
import { DemoTag, ErrorState, Loading, PageHeader, Panel, fmtInr, fmtPct } from "@/components/ui";

interface FitProduct {
  productId: string;
  name: string;
  category: string;
  priceInr: number;
  eligibleOrders: number;
  fitCases: number;
  fitRate: number;
  complaints: { term: string; n: number }[];
  complaintCoverage: number;
  sizeChart: { size: string; chest_in?: number; waist_in?: number; length_in?: number; uk?: number; foot_cm?: number }[];
  fitNotes: string;
  suggestions: string[];
}

interface FitData {
  dataSource: string;
  rankingNote: string;
  totalFitCases: number;
  topByVolume: FitProduct[];
  topByRate: { productId: string; name: string; eligibleOrders: number; fitCases: number; fitRate: number }[];
}

export default function FitPage() {
  const [d, setD] = useState<FitData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () =>
    fetch("/api/reports?report=fit")
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
        eyebrow="Fit Intelligence Studio"
        title="The five products causing fit returns"
        description="Fit returns are a sizing-guidance problem, not a customer problem. Ranked by verified genuine_fit_issue returns in the labeled demo data, with complaint terms extracted from the actual reason text and size charts from the catalogue."
        actions={<DemoTag label="Live aggregation over synthetic demo labels" />}
      />
      {err && <ErrorState message={err} onRetry={() => { setErr(null); load(); }} />}
      {!d && !err && <Loading label="Aggregating fit intelligence…" />}
      {d && (
        <div className="flex flex-col gap-5">
          <div className="rise flex items-start gap-3 rounded-xl border border-cyanx/25 bg-cyanx/5 p-4">
            <Ruler size={15} className="mt-0.5 shrink-0 text-cyanx" />
            <p className="text-[0.76rem] leading-relaxed text-mist">
              {d.rankingNote} Total genuine fit returns in data: <span className="num text-cyanx">{d.totalFitCases.toLocaleString("en-IN")}</span>.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {d.topByVolume.map((p, i) => (
              <Panel key={p.productId} className={`rise rise-${(i % 4) + 1}`}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="num text-[0.62rem] uppercase tracking-[0.2em] text-cyanx">rank #{i + 1} by volume</p>
                    <h3 className="h-display mt-1 text-[1rem] font-semibold text-snow">{p.name}</h3>
                    <p className="text-[0.7rem] text-fog">{p.productId} · {p.category} · {fmtInr(p.priceInr)}</p>
                  </div>
                  <div className="text-right">
                    <p className="num text-xl text-cyanx">{p.fitCases.toLocaleString("en-IN")}</p>
                    <p className="text-[0.62rem] uppercase tracking-widest text-fog">fit returns</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-abyss/60 p-2.5">
                    <p className="num text-[0.85rem] text-mist">{p.eligibleOrders.toLocaleString("en-IN")}</p>
                    <p className="text-[0.6rem] uppercase tracking-widest text-fog">eligible cases</p>
                  </div>
                  <div className="rounded-lg bg-abyss/60 p-2.5">
                    <p className="num text-[0.85rem] text-mist">{fmtPct(p.fitRate)}</p>
                    <p className="text-[0.6rem] uppercase tracking-widest text-fog">fit-return rate</p>
                  </div>
                  <div className="rounded-lg bg-abyss/60 p-2.5">
                    <p className="num text-[0.85rem] text-mist">{fmtPct(p.complaintCoverage, 0)}</p>
                    <p className="text-[0.6rem] uppercase tracking-widest text-fog">reasons parsed</p>
                  </div>
                </div>

                <div className="mt-3">
                  <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-fog">Top complaint terms</p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.complaints.map((c) => (
                      <span key={c.term} className="chip border-cyanx/25 bg-cyanx/5 text-mist">
                        {c.term} <span className="num text-cyanx">{c.n}</span>
                      </span>
                    ))}
                    {p.complaints.length === 0 && <span className="text-[0.72rem] italic text-fog/70">No lexicon terms found in reasons.</span>}
                  </div>
                </div>

                {p.sizeChart.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-fog">Catalogue size chart</p>
                    <table className="num border-separate border-spacing-1 text-[0.68rem]">
                      <thead>
                        <tr>
                          {Object.keys(p.sizeChart[0]).map((k) => (
                            <th key={k} className="rounded bg-raise px-2 py-1 text-left font-medium text-fog">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {p.sizeChart.slice(0, 6).map((row, ri) => (
                          <tr key={ri}>
                            {Object.values(row).map((v, vi) => (
                              <td key={vi} className="rounded bg-abyss/70 px-2 py-1 text-mist">{String(v)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-3 rounded-lg border border-tealx/25 bg-tealx/5 p-3">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-tealx">Data-backed correction</p>
                  {p.suggestions.map((s, i) => (
                    <p key={i} className="mt-1.5 text-[0.74rem] leading-relaxed text-mist">{s}</p>
                  ))}
                  <p className="mt-2 text-[0.64rem] italic text-fog/80">Catalogue note: {p.fitNotes}</p>
                </div>
              </Panel>
            ))}
          </div>

          <Panel title="Same list, ranked by fit-return rate" sub="Normalized view (min 120 eligible cases) — volume vs rate tell different stories; volume drives total loss, rate signals chart quality">
            <table className="w-full text-left text-[0.76rem]">
              <thead>
                <tr className="text-fog">
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 font-medium">Eligible</th>
                  <th className="pb-2 font-medium">Fit returns</th>
                  <th className="pb-2 text-right font-medium">Fit-return rate</th>
                </tr>
              </thead>
              <tbody>
                {d.topByRate.map((r) => (
                  <tr key={r.productId} className="border-t hairline">
                    <td className="py-2 text-mist">{r.name} <span className="num text-[0.65rem] text-fog">{r.productId}</span></td>
                    <td className="num py-2 text-fog">{r.eligibleOrders.toLocaleString("en-IN")}</td>
                    <td className="num py-2 text-fog">{r.fitCases.toLocaleString("en-IN")}</td>
                    <td className="num py-2 text-right text-cyanx">{fmtPct(r.fitRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      )}
    </div>
  );
}
