"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { AlertTriangle, Database, Loader2, ShieldCheck } from "lucide-react";
import { CLASS_META, ROUTING_META, type ReturnClass, type Routing } from "@/lib/ml/labels";

// ---------------------------------------------------------------------------
// Dataset mode: "demo" (synthetic showcase data) vs "real" (your uploaded/live
// data). Persisted, consumed by dashboards. Demo mode is always clearly labeled.
// ---------------------------------------------------------------------------

export type DataMode = "demo" | "real";
const ModeCtx = createContext<{ mode: DataMode; setMode: (m: DataMode) => void }>({
  mode: "demo",
  setMode: () => {},
});

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<DataMode>("demo");
  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("rg-mode") : null;
    if (stored === "demo" || stored === "real") setModeState(stored);
  }, []);
  const setMode = (m: DataMode) => {
    setModeState(m);
    try {
      window.localStorage.setItem("rg-mode", m);
    } catch {
      /* storage unavailable */
    }
  };
  return <ModeCtx.Provider value={{ mode, setMode }}>{children}</ModeCtx.Provider>;
}

export function useMode() {
  return useContext(ModeCtx);
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="rise">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="h-display mt-1.5 text-[clamp(1.45rem,3vw,2.1rem)] font-semibold leading-tight text-snow">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-[0.85rem] leading-relaxed text-fog">{description}</p>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function DemoTag({ label = "Synthetic demo data" }: { label?: string }) {
  return (
    <span className="chip border-amberx/30 bg-amberx/10 text-amberx" title="Computed from the labeled synthetic demonstration dataset — official competition data was not present in this repository.">
      <Database size={11} />
      {label}
    </span>
  );
}

export function RoutingBadge({ routing }: { routing: Routing }) {
  const meta = ROUTING_META[routing] ?? { color: "#8ca3c3", description: "" };
  return (
    <span
      className="chip"
      style={{ color: meta.color, borderColor: `${meta.color}55`, background: `${meta.color}14` }}
      title={meta.description}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {routing}
    </span>
  );
}

export function ClassBadge({ cls }: { cls: ReturnClass }) {
  const meta = CLASS_META[cls];
  return (
    <span
      className="chip"
      style={{ color: meta.color, borderColor: `${meta.color}55`, background: `${meta.color}14` }}
      title={meta.description}
    >
      {meta.short}
    </span>
  );
}

export function KPI({
  label,
  value,
  sub,
  tone = "cyan",
  delay = 0,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "cyan" | "amber" | "rose" | "emerald" | "violet" | "plain";
  delay?: number;
}) {
  const tones: Record<string, string> = {
    cyan: "text-cyanx",
    amber: "text-amberx",
    rose: "text-rose-x",
    emerald: "text-emeraldx",
    violet: "text-violetx",
    plain: "text-snow",
  };
  return (
    <div className={`panel rise rise-${delay} panel-hover px-4 py-3.5`}>
      <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-fog">{label}</p>
      <p className={`num mt-1.5 text-xl font-semibold ${tones[tone]}`}>{value}</p>
      {sub && <p className="mt-1 text-[0.6875rem] leading-snug text-fog">{sub}</p>}
    </div>
  );
}

export function Panel({
  title,
  sub,
  children,
  className = "",
  right,
}: {
  title?: string;
  sub?: string;
  children: ReactNode;
  className?: string;
  right?: ReactNode;
}) {
  return (
    <section className={`panel p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            {title && <h2 className="h-display text-[0.95rem] font-semibold text-snow">{title}</h2>}
            {sub && <p className="mt-0.5 text-[0.75rem] text-fog">{sub}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Loading({ label = "Computing…" }: { label?: string }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-live="polite">
      <div className="skeleton h-5 w-2/5" />
      <div className="skeleton h-24 w-full" />
      <p className="flex items-center gap-2 text-[0.75rem] text-fog">
        <Loader2 size={13} className="animate-spin text-cyanx" /> {label}
      </p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="panel flex items-start gap-3 border-rose-x/30 p-5" role="alert">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-x" />
      <div>
        <p className="text-[0.85rem] font-medium text-snow">Something failed</p>
        <p className="mt-1 text-[0.78rem] text-fog">{message}</p>
        {onRetry && (
          <button onClick={onRetry} className="btn mt-3">
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="panel flex flex-col items-center gap-2 px-6 py-12 text-center">
      <ShieldCheck size={22} className="text-cyanx/70" />
      <p className="text-[0.9rem] font-medium text-snow">{title}</p>
      <p className="max-w-sm text-[0.78rem] text-fog">{hint}</p>
    </div>
  );
}

export function fmtPct(v: number, dp = 1): string {
  return `${(v * 100).toFixed(dp)}%`;
}

export function fmtInr(v: number): string {
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}
