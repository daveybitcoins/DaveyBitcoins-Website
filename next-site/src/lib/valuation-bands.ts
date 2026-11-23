export const PE_MULTIPLES = [12, 14, 16, 18, 20, 22] as const;
export const YEAR_MS = 365.2425 * 86400000;

export type PricePoint = { date: string; ms: number; price: number };
export type ValuationAnchor = {
  asOf: string;
  ms: number;
  eps: number;
  source: string;
  sourceUrl: string | null;
};

function dateMs(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : NaN;
}

export function parseBandPrices(csv: string): PricePoint[] {
  const rows = csv.trim().split(/\r?\n/);
  const headers = rows.shift()?.replace(/^\uFEFF/, "").split(",") ?? [];
  const dateIndex = headers.indexOf("date");
  const priceIndex = headers.indexOf("price");
  if (dateIndex < 0 || priceIndex < 0) throw new Error("Price history is unavailable.");
  const points = new Map<number, PricePoint>();
  for (const row of rows) {
    const fields = row.split(",");
    const date = fields[dateIndex];
    const ms = dateMs(date);
    const price = Number(fields[priceIndex]);
    if (Number.isFinite(ms) && Number.isFinite(price) && price > 0) {
      points.set(ms, { date, ms, price });
    }
  }
  const result = [...points.values()].sort((a, b) => a.ms - b.ms);
  if (result.length < 2) throw new Error("Price history is unavailable.");
  return result;
}

export function parseValuationAnchor(value: unknown): ValuationAnchor {
  if (!value || typeof value !== "object") throw new Error("Forward EPS is unavailable.");
  const data = value as Record<string, unknown>;
  const ms = dateMs(data.as_of);
  const eps = data.forward_12m_eps;
  if (!Number.isFinite(ms) || typeof eps !== "number" || !Number.isFinite(eps) || eps <= 0) {
    throw new Error("Forward EPS is unavailable.");
  }
  let sourceUrl = null;
  try {
    const url = new URL(String(data.source_url));
    if (url.protocol === "https:") sourceUrl = url.href;
  } catch { /* A source name and date remain useful without a valid link. */ }
  return {
    asOf: String(data.as_of), ms, eps,
    source: typeof data.source === "string" ? data.source : "Saved valuation data",
    sourceUrl,
  };
}

// This is an explicit constant-growth scenario, including the historical
// reconstruction. It is not a point-in-time series of analyst EPS estimates.
export function modeledEPS(anchor: ValuationAnchor, ms: number, growthPct: number): number {
  if (!Number.isFinite(ms) || !Number.isFinite(growthPct) || growthPct < -20 || growthPct > 30) {
    throw new Error("Annual EPS growth must be between −20% and 30%.");
  }
  return anchor.eps * Math.pow(1 + growthPct / 100, (ms - anchor.ms) / YEAR_MS);
}

export function buildBandModel(prices: PricePoint[], anchor: ValuationAnchor, growthPct: number, horizon: number) {
  if (![1, 2, 3].includes(horizon)) throw new Error("Choose a one-, two-, or three-year projection.");
  const last = prices.at(-1);
  if (!last || anchor.ms > last.ms) throw new Error("Price history must reach the EPS report date.");
  const start = Math.max(prices[0].ms, Date.UTC(new Date(last.ms).getUTCFullYear() - 1, 0, 1));
  const endDate = new Date(last.ms);
  endDate.setUTCFullYear(endDate.getUTCFullYear() + horizon);
  const end = endDate.getTime();
  const history = prices.filter(point => point.ms >= start);
  const timestamps = new Set([start, anchor.ms, last.ms, end]);
  const month = new Date(start);
  month.setUTCDate(1);
  while (month.getTime() <= end) {
    if (month.getTime() >= start) timestamps.add(month.getTime());
    month.setUTCMonth(month.getUTCMonth() + 1);
  }
  const samples = [...timestamps].filter(ms => ms >= start).sort((a, b) => a - b)
    .map(ms => ({ ms, eps: modeledEPS(anchor, ms, growthPct) }));
  const historical = samples.filter(point => point.ms <= last.ms);
  const projected = samples.filter(point => point.ms >= last.ms);
  return { start, end, last, history, historical, projected, samples };
}
