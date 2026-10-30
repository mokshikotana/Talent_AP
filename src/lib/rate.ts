// Rate limiting + AI credit protection.
//
// Why globalThis: Next.js bundles each route handler separately, so a plain
// module-level Map can be duplicated per route and lose shared state. Pinning
// the store to globalThis keeps one shared counter per server process.
//
// Two layers:
//   1. Per-IP fixed window  — stops a single abusive visitor.
//   2. Global budget caps   — protects the API key owner's credits even if an
//      attacker rotates IPs (distributed abuse). This is the layer that
//      actually prevents credit drain.

interface Bucket {
  count: number;
  resetAt: number;
}

const g = globalThis as typeof globalThis & {
  __rgRate?: Map<string, Bucket>;
};
const buckets: Map<string, Bucket> = (g.__rgRate ??= new Map<string, Bucket>());

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  // opportunistic cleanup so the map cannot grow unbounded
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  b.count++;
  return { allowed: b.count <= limit, remaining: Math.max(0, limit - b.count), resetAt: b.resetAt };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return req.headers.get("x-real-ip")?.slice(0, 64) ?? "local";
}

/** Global AI call budget — the real safeguard for your API credits. */
export const AI_BUDGET = {
  perMinute: Number(process.env.AI_MAX_PER_MINUTE || 40),
  perDay: Number(process.env.AI_MAX_PER_DAY || 1500),
};

export interface BudgetVerdict {
  allowed: boolean;
  reason?: string;
  remainingToday: number;
}

/** Consumes one global AI call slot. Call BEFORE hitting the model. */
export function consumeAiBudget(): BudgetVerdict {
  const minute = rateLimit("ai:global:minute", AI_BUDGET.perMinute, 60_000);
  const day = rateLimit("ai:global:day", AI_BUDGET.perDay, 24 * 60 * 60_000);
  const remainingToday = day.remaining;
  if (!minute.allowed) {
    return { allowed: false, reason: "The assistant is busy right now. Please try again in a minute.", remainingToday };
  }
  if (!day.allowed) {
    return {
      allowed: false,
      reason: "The assistant has reached today's usage limit and will reset tomorrow.",
      remainingToday: 0,
    };
  }
  return { allowed: true, remainingToday };
}

export function aiBudgetSnapshot(): { perMinute: number; perDay: number } {
  return { ...AI_BUDGET };
}
