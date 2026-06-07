// CareerPilot — RPD-aware Gemini model picker.
//
// Why this exists:
//   CareerPilot is currently on a free / demo Gemini tier. Different
//   assistant paths have different cost / quality trade-offs:
//
//     - High-volume, low-stakes paths (intent classifier, dynamic role
//       synthesis, general chat) should use a CHEAP model so the user
//       can click chips without burning the per-minute quota.
//     - User-facing, quality-sensitive paths (the cover letter agent)
//       deserve the best model we have, even if it costs more RPM.
//
// Model budgets observed on the demo account (subject to change):
//
//   | Model              | Tier    | RPM  | Tokens/min | RPD  |
//   |--------------------|---------|------|------------|------|
//   | gemini-3.5-flash     | quality |  5   | 250K       | 20   |
//   | gemini-2.5-flash     | quality |  5   | 250K       | 20   |
//   | gemini-3.1-flash-lite| economy | 15   | 250K       | 500  |
//   | gemini-2.5-flash-lite| economy | 10   | 250K       | 20   |
//
// Strategy:
//   - Quality tier: rotate 3.5-flash → 2.5-flash. Used for the cover
//     letter agent (the one user-visible long-form path).
//   - Economy tier: rotate 3.1-flash-lite → 2.5-flash-lite. Used for
//     the classifier, dynamic synthesis, readiness / gap / roadmap
//     sub-agents, and general chat.
//
// RPD awareness:
//   - Every model has a per-UTC-day counter.
//   - `pickModel(tier)` filters out models that have hit their RPD cap.
//   - `markExhausted(modelId)` is called by `lib/ai/provider.ts` when a
//     429 surfaces for a model so subsequent calls in the same UTC day
//     skip it without burning more quota.
//   - If every model in a tier is exhausted, the picker falls through to
//     the other tier (with a warning) so the demo never hard-fails. If
//     even the fallback is exhausted, the route surfaces the 429.
//
// Every helper returns { model, maxOutputTokens }. The maxOutputTokens
// ceiling is conservative for the cheap tier (tighter per-call limits)
// and generous for the quality tier (user-visible output).

export type ModelTier = "quality" | "economy";

export interface ModelChoice {
  /** Gemini model id. */
  model: string;
  /**
   * Suggested maxOutputTokens for this call. Callers can still override
   * per-call (e.g. the cover letter agent needs 1200 to avoid truncation).
   */
  maxOutputTokens: number;
}

interface ModelCap {
  tier: ModelTier;
  rpm: number;
  rpd: number;
}

/**
 * Source of truth for per-model limits. Adding a new model? Add it here
 * AND to QUALITY_MODELS / ECONOMY_MODELS below (so the rotation order
 * is explicit).
 */
const MODEL_CAPS: Record<string, ModelCap> = {
  "gemini-3.5-flash": { tier: "quality", rpm: 5, rpd: 20 },
  "gemini-2.5-flash": { tier: "quality", rpm: 5, rpd: 20 },
  "gemini-3.1-flash-lite": { tier: "economy", rpm: 15, rpd: 500 },
  "gemini-2.5-flash-lite": { tier: "economy", rpm: 10, rpd: 20 },
};

const QUALITY_MODELS: ModelChoice[] = [
  // 3.5-flash is the demo's best quality model. 2.5-flash is the fallback
  // if 3.5 ever exhausts on us.
  { model: "gemini-3.5-flash", maxOutputTokens: 1200 },
  { model: "gemini-2.5-flash", maxOutputTokens: 1200 },
];

const ECONOMY_MODELS: ModelChoice[] = [
  // Flash-lite variants have higher RPM/RPD and cost less. 3.1 first.
  { model: "gemini-3.1-flash-lite", maxOutputTokens: 800 },
  { model: "gemini-2.5-flash-lite", maxOutputTokens: 800 },
];

// ---------- Daily RPD counter ----------

type Counter = { date: string; count: number };

const dailyCounters = new Map<string, Counter>();

/** UTC date string YYYY-MM-DD. Caps reset at UTC midnight. */
function getTodayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function getOrInitCounter(modelId: string): Counter {
  const today = getTodayUtc();
  let c = dailyCounters.get(modelId);
  if (!c || c.date !== today) {
    c = { date: today, count: 0 };
    dailyCounters.set(modelId, c);
  }
  return c;
}

/**
 * Increment the daily counter for a model on a successful call.
 * Safe to call multiple times — date rollover resets to 0.
 */
export function bumpUsage(modelId: string): void {
  const c = getOrInitCounter(modelId);
  c.count += 1;
}

/**
 * Mark a model as exhausted for the rest of the UTC day. Called by the
 * provider layer when a 429 / RESOURCE_EXHAUSTED comes back. Subsequent
 * calls in the same UTC day skip this model entirely.
 */
export function markExhausted(modelId: string): void {
  const cap = MODEL_CAPS[modelId];
  if (!cap) return; // unknown model — nothing to cap
  const c = getOrInitCounter(modelId);
  c.count = cap.rpd;
}

/**
 * How many RPD calls remain for a model today. 0 means "exhausted,
 * skip me". Returns 0 for unknown models as a defensive default.
 */
export function remainingRpd(modelId: string): number {
  const cap = MODEL_CAPS[modelId];
  if (!cap) return 0;
  const c = getOrInitCounter(modelId);
  return Math.max(0, cap.rpd - c.count);
}

/** Diagnostic snapshot of every model the picker knows about. */
export interface ModelUsageRow {
  model: string;
  tier: ModelTier;
  rpm: number;
  rpd: number;
  used: number;
  remaining: number;
  /** ISO timestamp when the counter will reset (next UTC midnight). */
  resetAt: string;
}

export function getUsage(): ModelUsageRow[] {
  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);
  const rows: ModelUsageRow[] = [];
  for (const [modelId, cap] of Object.entries(MODEL_CAPS)) {
    const c = getOrInitCounter(modelId);
    const used = c.date === getTodayUtc() ? c.count : 0;
    rows.push({
      model: modelId,
      tier: cap.tier,
      rpm: cap.rpm,
      rpd: cap.rpd,
      used,
      remaining: Math.max(0, cap.rpd - used),
      resetAt: tomorrow.toISOString(),
    });
  }
  return rows;
}

/**
 * Clear all daily counters. Intended for tests and the /api/health
 * debug endpoint — production code should not call this.
 */
export function reset(): void {
  dailyCounters.clear();
}

// ---------- Picker ----------

/**
 * Pick a model for a given tier. Filters out models that have hit their
 * RPD cap, then rotates deterministically by current minute so a quick
 * burst of calls is spread across models instead of hammering one.
 *
 * If the entire tier is exhausted, falls through to the OTHER tier
 * (quality → economy or vice versa) with a console.warn. If even the
 * fallback tier is exhausted, returns the first model in the requested
 * tier anyway — the next 429 will be surfaced by the route and the
 * caller can show a "try tomorrow" message.
 */
export function pickModel(tier: ModelTier): ModelChoice {
  const primary = filterByCap(tier === "quality" ? QUALITY_MODELS : ECONOMY_MODELS);
  if (primary.length > 0) {
    return rotate(primary);
  }
  // Fall through to the other tier.
  const fallbackTier: ModelTier = tier === "quality" ? "economy" : "quality";
  const fallback = filterByCap(
    fallbackTier === "quality" ? QUALITY_MODELS : ECONOMY_MODELS,
  );
  if (fallback.length > 0) {
    console.warn(
      `[models] ${tier} tier fully exhausted for the UTC day, ` +
        `falling back to ${fallbackTier} tier`,
    );
    return rotate(fallback);
  }
  // Last resort: return the first model of the requested tier and let
  // the next 429 surface. The route layer will turn it into a clean
  // error message rather than a 500.
  const pool = tier === "quality" ? QUALITY_MODELS : ECONOMY_MODELS;
  console.warn(
    `[models] ALL models exhausted for the UTC day; returning ` +
      `${pool[0]?.model ?? "?"} (next 429 will surface to the caller)`,
  );
  return pool[0]!;
}

/**
 * Return the next-best model after a 429. Walks the requested tier first,
 * then falls through to the other tier so a single 429 never cascades
 * into a hard failure as long as ANY model has RPD left.
 *
 * Returns null only when every model in both tiers is exhausted.
 */
export function nextModel(
  tier: ModelTier,
  failedModel: string,
): ModelChoice | null {
  const requested =
    tier === "quality" ? QUALITY_MODELS : ECONOMY_MODELS;
  const other: ModelTier = tier === "quality" ? "economy" : "quality";
  const otherPool = other === "quality" ? QUALITY_MODELS : ECONOMY_MODELS;

  // 1. Try the rest of the requested tier.
  const requestedAvailable = filterByCap(requested);
  const requestedIdx = requestedAvailable.findIndex(
    (m) => m.model === failedModel,
  );
  if (requestedIdx >= 0 && requestedIdx + 1 < requestedAvailable.length) {
    return requestedAvailable[requestedIdx + 1] ?? null;
  }
  // failedModel wasn't in the available pool (it just exhausted).
  // Return the first remaining requested-tier model if any.
  if (requestedAvailable.length > 0) {
    return requestedAvailable[0] ?? null;
  }

  // 2. Fall through to the other tier.
  const fallbackAvailable = filterByCap(otherPool);
  if (fallbackAvailable.length === 0) return null;
  console.warn(
    `[models] ${tier} tier fully exhausted; falling back to ${other} tier ` +
      `(${fallbackAvailable[0]?.model})`,
  );
  return fallbackAvailable[0] ?? null;
}

// ---------- internal helpers ----------

function filterByCap(pool: ModelChoice[]): ModelChoice[] {
  return pool.filter((m) => remainingRpd(m.model) > 0);
}

function rotate(pool: ModelChoice[]): ModelChoice {
  // pool is non-empty by precondition at every call site.
  const minute = Math.floor(Date.now() / 60_000);
  return pool[minute % pool.length] ?? pool[0]!;
}
