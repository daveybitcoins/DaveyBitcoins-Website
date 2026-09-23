"use client";

import { useEffect, useState } from "react";
import { bitcoinSnapshot, spySnapshot } from "@/lib/market-models";

type Reading = { date: string; value: number; price?: number; live?: boolean };
type Snapshot = { btc?: Reading; spy?: Reading; breadth?: Reading };
const definitions = [
  { key: "btc", title: "Bitcoin risk", detail: "Structural + momentum", href: "/risk-metric/" },
  { key: "spy", title: "SPY cycle risk", detail: "200-week trend percentile · Weekly signal", href: "/spy-risk-metric/" },
  { key: "breadth", title: "Market breadth", detail: "Stocks above their 200-day average", href: "/ema-scanner/" },
] as const;
function zone(value: number, symbol: "btc" | "spy") {
  return value < 0.1 ? "Generational" : value < (symbol === "btc" ? 0.25 : 0.3) ? "Accumulate" : value < 0.5 ? "Neutral" : value < 0.7 ? "Elevated" : value < 0.9 ? "Caution" : "Euphoria";
}
function parsePrices(text: string): [string, number][] {
  const rows = text.trim().split(/\r?\n/).slice(1).map(row => {
    const [date, price] = row.split(",");
    return [date, Number(price)] as [string, number];
  }).filter(([date, price]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(price) && price > 0);
  return rows.sort((a, b) => a[0].localeCompare(b[0]));
}
export function MarketSnapshot() {
  const [snapshot, setSnapshot] = useState<Snapshot>({});
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string>();
  useEffect(() => {
    let active = true;
    let running = false;
    let controller: AbortController | undefined;
    async function refresh() {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      setLoading(true);
      controller = new AbortController();
      const signal = controller.signal;
      const timeout = setTimeout(() => controller?.abort(), 12000);
      const version = Date.now();
      async function fetchData(path: string) {
        const url = path.startsWith("/") ? `${path}?v=${version}` : path;
        const response = await fetch(url, { cache: "no-store", signal });
        if (!response.ok) throw new Error("Data unavailable");
        return response;
      }
      const tasks = [
        fetchData("/data.csv").then(r => r.text()).then(async text => {
          const rows = parsePrices(text);
          const saved = bitcoinSnapshot(rows);
          if (active) setSnapshot(s => ({ ...s, btc: { date: saved.date, value: saved.risk, price: saved.price } }));
          // A quote outage must not hide the saved reading or block the other cards.
          try {
            const data = await fetchData("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true").then(r => r.json());
            const price = data.bitcoin?.usd;
            const timestamp = data.bitcoin?.last_updated_at;
            if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp) || timestamp <= 0 || timestamp * 1000 > Date.now() + 60000) return;
            const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
            const last = rows[rows.length - 1];
            if (date < last[0] || Date.now() - timestamp * 1000 > 3600000) return;
            if (date === last[0]) last[1] = price;
            else rows.push([date, price]);
            const point = bitcoinSnapshot(rows);
            if (active && Number.isFinite(point.risk)) setSnapshot(s => ({ ...s, btc: { date: point.date, value: point.risk, price: point.price, live: true } }));
          } catch { /* Keep the saved reading. */ }
        }),
        fetchData("/data_spy.csv").then(r => r.text()).then(text => {
          const point = spySnapshot(parsePrices(text));
          if (active && Number.isFinite(point.risk)) setSnapshot(s => ({ ...s, spy: { date: point.date, value: point.risk, price: point.price } }));
        }),
        fetchData("/data/scanner_data.json").then(r => r.json()).then(data => {
          const value = data.breadth_context?.above_200d;
          if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(data.meta?.date)) throw new Error("Invalid breadth data");
          if (active) setSnapshot(s => ({ ...s, breadth: { date: data.meta.date, value } }));
        }),
      ];
      const results = await Promise.allSettled(tasks);
      clearTimeout(timeout);
      running = false;
      if (active) {
        setFailed(results.some(result => result.status === "rejected"));
        setCheckedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
        setLoading(false);
      }
    }
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 60000);
    const resume = () => { void refresh(); };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    return () => {
      active = false;
      clearInterval(interval);
      controller?.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
    };
  }, [attempt]);
  const incomplete = definitions.some(({ key }) => !snapshot[key]);
  return (
    <section className="market-snapshot" aria-labelledby="snapshot-heading">
      <div className="snapshot-heading">
        <div><p className="eyebrow">The latest market readings</p><h2 id="snapshot-heading">Market snapshot</h2></div>
        <p>Refreshes every minute<br />SPY signal updates weekly; breadth after scanner runs.</p>
      </div>
      <div className="snapshot-grid" aria-busy={loading}>
        {definitions.map(({ key, title, detail, href }) => {
          const reading = snapshot[key];
          return <a className="snapshot-card" href={href} key={key}
            data-tone={reading ? (key === "breadth" ? "Breadth" : zone(reading.value, key)) : undefined}>
            <span className="snapshot-card__title">{title}<span aria-hidden="true">↗</span></span>
            <div className="snapshot-card__reading"><strong>{reading ? (key === "breadth" ? `${reading.value.toFixed(1)}%` : reading.value.toFixed(3)) : "—"}</strong>
              {reading && key !== "breadth" && <span className="snapshot-zone">{zone(reading.value, key)}</span>}
            </div>
            <span className="snapshot-card__detail">{detail}</span>
            {reading ? <span className="snapshot-card__date">{reading.live ? "Latest quote · " : "Saved data · "}<time dateTime={reading.date}>{reading.date}</time></span> : <span className="snapshot-card__date">{loading ? "Loading reading…" : "Reading unavailable"}</span>}
          </a>;
        })}
      </div>
      <p className="snapshot-status" role="status">
        {loading ? "Checking for updates… " : failed || incomplete ? "Update incomplete; showing the latest available readings. " : `Last checked ${checkedAt}. `}
        <button type="button" disabled={loading} onClick={() => setAttempt(a => a + 1)}>Refresh now</button>
      </p>
    </section>
  );
}
