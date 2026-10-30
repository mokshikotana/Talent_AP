"use client";

import { useId } from "react";
import { CLASS_META, CLASSES, ROUTING_META, ROUTINGS, type Routing } from "@/lib/ml/labels";

/** Stacked routing donut with total in the middle. */
export function RoutingDonut({
  distribution,
  size = 148,
}: {
  distribution: Partial<Record<Routing, number>>;
  size?: number;
}) {
  const total = ROUTINGS.reduce((s, r) => s + (distribution[r] ?? 0), 0);
  const R = 44;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox="0 0 110 110" role="img" aria-label="Routing distribution">
        <circle cx="55" cy="55" r={R} fill="none" stroke="rgba(166,156,138,0.12)" strokeWidth="11" />
        {ROUTINGS.map((r) => {
          const v = distribution[r] ?? 0;
          if (!v || total === 0) return null;
          const frac = v / total;
          const dash = frac * C;
          const el = (
            <circle
              key={r}
              cx="55"
              cy="55"
              r={R}
              fill="none"
              stroke={ROUTING_META[r].color}
              strokeWidth="11"
              strokeDasharray={`${Math.max(0, dash - 1.5)} ${C - dash + 1.5}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 55 55)"
              strokeLinecap="butt"
            >
              <title>{`${r}: ${v.toLocaleString("en-IN")} (${(frac * 100).toFixed(1)}%)`}</title>
            </circle>
          );
          offset += dash;
          return el;
        })}
        <text x="55" y="52" textAnchor="middle" fill="#ecf2fb" fontSize="15" fontWeight="600" fontFamily="var(--font-mono)">
          {total.toLocaleString("en-IN")}
        </text>
        <text x="55" y="66" textAnchor="middle" fill="#8ca3c3" fontSize="7.5" letterSpacing="1">
          ROUTED CASES
        </text>
      </svg>
      <ul className="flex flex-col gap-1.5">
        {ROUTINGS.map((r) => {
          const v = distribution[r] ?? 0;
          return (
            <li key={r} className="flex items-center gap-2 text-[0.72rem]">
              <span className="h-2 w-2 rounded-sm" style={{ background: ROUTING_META[r].color }} />
              <span className="w-24 text-fog">{r}</span>
              <span className="num text-mist">{v.toLocaleString("en-IN")}</span>
              <span className="num text-fog/70">{total ? ((v / total) * 100).toFixed(1) : 0}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 4-class probability bars. */
export function ProbBars({
  probs,
  predicted,
  compact = false,
}: {
  probs: Record<string, number>;
  predicted?: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col ${compact ? "gap-1" : "gap-2"}`}>
      {CLASSES.map((c) => {
        const meta = CLASS_META[c];
        const v = probs[c] ?? 0;
        return (
          <div key={c} className="flex items-center gap-2">
            <span className={`${compact ? "w-20" : "w-24"} truncate text-[0.7rem] text-fog`} title={meta.label}>
              {meta.short}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-raise">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max(1.5, v * 100)}%`,
                  background: `linear-gradient(90deg, ${meta.color}88, ${meta.color})`,
                  boxShadow: predicted === c ? `0 0 12px ${meta.color}66` : undefined,
                }}
              />
            </div>
            <span className="num w-12 text-right text-[0.7rem] text-mist">{(v * 100).toFixed(1)}%</span>
          </div>
        );
      })}
    </div>
  );
}

/** Horizontal bar series for metric comparisons. */
export function HBars({
  rows,
  max,
  fmt = (v) => v.toFixed(2),
}: {
  rows: { label: string; value: number; color?: string; hint?: string }[];
  max?: number;
  fmt?: (v: number) => string;
}) {
  const m = max ?? Math.max(...rows.map((r) => r.value), 1e-9);
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="w-32 truncate text-[0.7rem] text-fog" title={r.label}>
            {r.label}
          </span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-raise">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(1, (r.value / m) * 100)}%`, background: r.color ?? "#8b6f47" }}
            />
          </div>
          <span className="num w-16 text-right text-[0.7rem] text-mist" title={r.hint}>
            {fmt(r.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 4x4 confusion matrix heatmap (rows true, cols predicted). */
export function ConfusionMatrix({ matrix }: { matrix: number[][] }) {
  const gid = useId();
  const maxVal = Math.max(...matrix.flat(), 1);
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1" aria-label="Confusion matrix (rows: true class, columns: predicted)">
        <thead>
          <tr>
            <th scope="col" className="text-right text-[0.65rem] font-normal text-fog">
              true → pred
            </th>
            {CLASSES.map((c) => (
              <th key={c} scope="col" className="px-1 text-[0.65rem] font-medium" style={{ color: CLASS_META[c].color }}>
                {CLASS_META[c].short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={`${gid}-${i}`}>
              <th scope="row" className="pr-1 text-right text-[0.65rem] font-medium" style={{ color: CLASS_META[CLASSES[i]].color }}>
                {CLASS_META[CLASSES[i]].short}
              </th>
              {row.map((v, j) => {
                const isDiag = i === j;
                const a = 0.08 + (v / maxVal) * 0.75;
                return (
                  <td
                    key={`${gid}-${i}-${j}`}
                    className="num h-11 w-16 rounded-lg text-center text-[0.72rem]"
                    style={{
                      background: `${isDiag ? "#5f7f6d" : "#a05e57"}${Math.round(a * 255).toString(16).padStart(2, "0")}`,
                    }}
                    title={`true=${CLASSES[i]}, pred=${CLASSES[j]}: ${v.toLocaleString("en-IN")}`}
                  >
                    <span style={{ color: isDiag ? "#20402c" : "#5a2620" }}>{v.toLocaleString("en-IN")}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tiny sparkline. */
export function Spark({ values, color = "#8b6f47", height = 36 }: { values: number[]; color?: string; height?: number }) {
  const gid = useId();
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const w = 100;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${20 - (v / max) * 18}`);
  return (
    <svg viewBox={`0 0 ${w} 22`} style={{ width: "100%", height }} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <polygon points={`0,22 ${pts.join(" ")} ${w},22`} fill={`url(#g-${gid})`} opacity="0.35" />
      <defs>
        <linearGradient id={`g-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
    </svg>
  );
}
