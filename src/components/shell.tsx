"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  ScanSearch,
  ClipboardList,
  Microscope,
  FlaskConical,
  Scale,
  Ruler,
  MessageSquareHeart,
  Database,
  Activity,
  ShieldHalf,
  Menu,
  X,
  FlaskConical as DemoIcon,
  Briefcase,
} from "lucide-react";
import { ModeProvider, useMode } from "@/components/ui";
import { AskNova } from "@/components/ask-nova";

function ModeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useMode();
  return (
    <div
      role="tablist"
      aria-label="Dataset mode"
      className="flex items-center gap-0.5 rounded-full border hairline bg-panel p-0.5 shadow-sm"
    >
      <button
        role="tab"
        aria-selected={mode === "demo"}
        onClick={() => setMode("demo")}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.7rem] font-semibold transition-all ${
          mode === "demo" ? "bg-cyanx/15 text-cyanx shadow-[inset_0_0_0_1px_rgba(139,111,71,0.4)]" : "text-fog hover:text-mist"
        }`}
      >
        <DemoIcon size={12} /> {compact ? "Demo" : "Demo data"}
      </button>
      <button
        role="tab"
        aria-selected={mode === "real"}
        onClick={() => setMode("real")}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.7rem] font-semibold transition-all ${
          mode === "real" ? "bg-tealx/15 text-tealx shadow-[inset_0_0_0_1px_rgba(95,127,109,0.45)]" : "text-fog hover:text-mist"
        }`}
      >
        <Briefcase size={12} /> {compact ? "Real" : "Your data"}
      </button>
    </div>
  );
}

const NAV = [
  {
    group: "Operations",
    items: [
      { href: "/", label: "Command Center", icon: LayoutDashboard },
      { href: "/engine", label: "Return Decision Engine", icon: ScanSearch },
      { href: "/workbench", label: "Human Review Workbench", icon: ClipboardList },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { href: "/explainability", label: "Explainability Studio", icon: Microscope },
      { href: "/evaluation", label: "Model Evaluation Lab", icon: FlaskConical },
      { href: "/fairness", label: "Fairness Observatory", icon: Scale },
      { href: "/fit", label: "Fit Intelligence Studio", icon: Ruler },
    ],
  },
  {
    group: "Engagement",
    items: [{ href: "/assistant", label: "Resolution Assistant", icon: MessageSquareHeart }],
  },
  {
    group: "System",
    items: [
      { href: "/data", label: "Data & Model Management", icon: Database },
      { href: "/audit", label: "Audit & System Health", icon: Activity },
    ],
  },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-6">
      {NAV.map((g) => (
        <div key={g.group}>
          <p className="px-3 pb-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.2em] text-fog/70">
            {g.group}
          </p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[0.8125rem] font-medium transition-all ${
                      active
                        ? "bg-cyanx/10 text-snow shadow-[inset_0_0_0_1px_rgba(34,211,238,0.35)]"
                        : "text-fog hover:bg-raise hover:text-mist"
                    }`}
                  >
                    <Icon
                      size={15}
                      strokeWidth={2}
                      className={active ? "text-cyanx" : "text-fog/70 group-hover:text-cyanx"}
                    />
                    {item.label}
                    {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyanx pulse-dot" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-3 py-5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyanx/25 to-tealx/10 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.4)]">
        <ShieldHalf size={18} className="text-cyanx" />
      </span>
      <span>
        <span className="h-display block text-[0.95rem] font-semibold leading-tight text-snow">
          ReturnGuard <span className="text-cyanx">AI</span>
        </span>
        <span className="block text-[0.625rem] leading-tight tracking-wide text-fog">
          Returns intelligence · demo build
        </span>
      </span>
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <ModeProvider>
      <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r hairline bg-abyss/80 backdrop-blur-md lg:flex">
        <Brand />
        <NavLinks />
        <div className="border-t hairline px-5 py-3">
          <p className="text-[0.625rem] leading-relaxed text-fog/70">
            Synthetic demo dataset · provisional cost matrix · see Data &amp; Models
          </p>
        </div>
      </aside>

      {/* Desktop dataset-mode toggle */}
      <div className="fixed right-6 top-5 z-40 hidden lg:block">
        <ModeToggle />
      </div>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-2 border-b hairline bg-abyss/90 px-4 py-2.5 backdrop-blur-md lg:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          <ModeToggle compact />
          <button
            aria-label={open ? "Close navigation" : "Open navigation"}
            onClick={() => setOpen(!open)}
            className="btn px-2 py-1.5"
          >
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 border-r hairline bg-abyss pt-16">
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <main className="flex-1 px-4 pb-16 pt-16 sm:px-6 lg:ml-60 lg:px-10 lg:pt-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {/* Floating AI help assistant — present on every page */}
      <AskNova />
      </div>
    </ModeProvider>
  );
}
