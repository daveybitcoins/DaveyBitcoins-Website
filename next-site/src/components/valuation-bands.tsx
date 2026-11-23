"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  buildBandModel, modeledEPS, parseBandPrices, parseValuationAnchor, PE_MULTIPLES,
  type PricePoint, type ValuationAnchor,
} from "@/lib/valuation-bands";
import "./valuation-bands.css";

type BandData = { prices: PricePoint[]; anchor: ValuationAnchor };
const number = (value: number, decimals = 0) => value.toLocaleString("en-US", { maximumFractionDigits: decimals });
const date = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function ValuationBands() {
  const [data, setData] = useState<BandData>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 15000);
    async function load() {
      try {
        const responses = await Promise.all(["/data_spy.csv", "/data/spy_valuation.json"].map(path =>
          fetch(path, { cache: "no-store", signal: controller.signal }).then(response => {
            if (!response.ok) throw new Error("Saved market data could not be loaded.");
            return response;
          })));
        const [csv, valuation] = await Promise.all([responses[0].text(), responses[1].json()]);
        const prices = parseBandPrices(csv);
        const anchor = parseValuationAnchor(valuation);
        buildBandModel(prices, anchor, 8, 2);
        if (active) setData({ prices, anchor });
      } catch {
        if (active) setError("The valuation chart is unavailable. Check your connection and retry.");
      } finally { clearTimeout(timeout); }
    }
    void load();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt]);

  return (
    <section className="spy-panel valuation-bands" id="valuation-bands" aria-labelledby="valuation-bands-heading">
      <header className="vb-heading">
        <div>
          <p className="vb-eyebrow">Earnings & valuation</p>
          <h2 id="valuation-bands-heading">S&P 500 Forward P/E Valuation Bands</h2>
          <p className="vb-subtitle">12-month forward EPS × P/E multiples</p>
        </div>
        <span className="vb-model-badge">Modeled EPS bands</span>
      </header>
      {data ? <BandChart data={data} /> : (
        <div className="vb-loading" role="status">
          <p>{error || "Loading price history and forward EPS…"}</p>
          {error && <button type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Retry chart</button>}
        </div>
      )}
    </section>
  );
}

function BandChart({ data: { prices, anchor } }: { data: BandData }) {
  const [growth, setGrowth] = useState(8);
  const [growthInput, setGrowthInput] = useState("8");
  const [horizon, setHorizon] = useState(2);
  const [unit, setUnit] = useState("spx");
  const [selectedMs, setSelectedMs] = useState<number | null>(null);
  const uid = useId().replaceAll(":", "");
  const model = useMemo(() => buildBandModel(prices, anchor, growth, horizon), [prices, anchor, growth, horizon]);
  const scale = unit === "spx" ? 1 : 0.1;
  const priceLabel = unit === "spx" ? "S&P 500 proxy" : "SPY";
  const format = (value: number) => `${unit === "spy" ? "$" : ""}${number(value, unit === "spy" ? 2 : 0)}`;
  const formatMarker = (value: number) => `${unit === "spy" ? "$" : ""}${number(value)}`;
  const minPE = PE_MULTIPLES[0];
  const maxPE = PE_MULTIPLES[PE_MULTIPLES.length - 1];
  const bandRange = `${minPE}×–${maxPE}×`;
  const projectionMarkers = model.projected.filter(point => point.ms < model.end && new Date(point.ms).getUTCMonth() % 3 === 0 && new Date(point.ms).getUTCDate() === 1);
  const values = [...model.history.map(point => point.price * 10), ...model.samples.flatMap(point => [point.eps * minPE, point.eps * maxPE])].map(value => value * scale);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const step = Math.pow(10, Math.floor(Math.log10((high - low) / 5)));
  const tickSize = [1, 2, 5, 10].map(n => n * step).find(n => n >= (high - low) / 5) ?? step * 10;
  const min = Math.max(0, Math.floor((low - (high - low) * 0.08) / tickSize) * tickSize);
  const max = Math.ceil((high + (high - low) * 0.1) / tickSize) * tickSize;
  // Keep every circle value legible: longer horizons need more horizontal
  // room, and falling-EPS scenarios need more space between their lower bands.
  const shortestQuarter = Math.min(...projectionMarkers.slice(1).map((point, i) => point.ms - projectionMarkers[i].ms));
  const plotWidth = Math.max(916, (model.end - model.start) / shortestQuarter * 60);
  const tightestBandGap = Math.min(...model.projected.map(point => point.eps)) * (PE_MULTIPLES[1] - minPE) * scale;
  const plotHeight = Math.max(374, (max - min) / tightestBandGap * 30);
  const PLOT = { left: 72, right: 72 + plotWidth, top: 64, bottom: 64 + plotHeight };
  const width = PLOT.right + 112;
  const height = PLOT.bottom + 62;
  const x = (ms: number) => PLOT.left + (ms - model.start) / (model.end - model.start) * plotWidth;
  const y = (value: number) => PLOT.bottom - (value - min) / (max - min) * (PLOT.bottom - PLOT.top);
  const yTicks = Array.from({ length: Math.round((max - min) / tickSize) + 1 }, (_, i) => min + i * tickSize);
  const xTicks: number[] = [];
  const tick = new Date(Date.UTC(new Date(model.start).getUTCFullYear(), 0, 1));
  while (tick.getTime() <= model.end) {
    if (tick.getTime() >= model.start) xTicks.push(tick.getTime());
    tick.setUTCMonth(tick.getUTCMonth() + (horizon === 1 ? 3 : 6));
  }
  const line = (points: { ms: number; value: number }[]) => points.map((point, index) => `${index ? "L" : "M"}${x(point.ms).toFixed(2)},${y(point.value).toFixed(2)}`).join(" ");
  const bandPath = (points: { ms: number; eps: number }[], pe: number) => line(points.map(point => ({ ms: point.ms, value: point.eps * pe * scale })));
  const pricePath = line(model.history.map(point => ({ ms: point.ms, value: point.price * 10 * scale })));
  const area = (points: { ms: number; eps: number }[]) => `${bandPath(points, maxPE)} ${bandPath([...points].reverse(), minPE).replace(/^M/, "L")} Z`;
  const inspectMs = Math.max(model.start, Math.min(model.end, Math.round((selectedMs ?? model.last.ms) / 86400000) * 86400000));
  const selected = inspectMs > model.last.ms ? { ms: inspectMs, price: null } : model.history.reduce((nearest, point) =>
    Math.abs(point.ms - inspectMs) < Math.abs(nearest.ms - inspectMs) ? point : nearest);
  const selectedEps = modeledEPS(anchor, selected.ms, growth);
  const future = selected.ms > model.last.ms;
  const validGrowth = growthInput.trim() !== "" && Number.isFinite(Number(growthInput)) && Number(growthInput) >= -20 && Number(growthInput) <= 30;
  const endEps = model.projected.at(-1)!.eps;
  const currentEps = modeledEPS(anchor, model.last.ms, growth);
  // Falling-EPS scenarios can compress the endpoint labels. Keep their text
  // separated and connect each label to its actual band endpoint.
  const bandLabels = [...PE_MULTIPLES].reverse().map(pe => ({ pe, position: y(endEps * pe * scale) }));
  for (let i = 1; i < bandLabels.length; i++) bandLabels[i].position = Math.max(bandLabels[i].position, bandLabels[i - 1].position + 22);
  const labelOverflow = Math.max(0, bandLabels.at(-1)!.position - PLOT.bottom + 4);
  for (const label of bandLabels) label.position -= labelOverflow;

  return <>
    <div className="vb-stats">
      <div><span>Latest saved {priceLabel}</span><strong className="vb-teal">{format(model.last.price * 10 * scale)}</strong><small>{date(model.last.ms)} close{unit === "spx" ? " · SPY × 10" : ""}</small></div>
      <div><span>Approx. forward EPS anchor</span><strong>${number(anchor.eps, 2)}</strong><small>Index EPS · {date(anchor.ms)}</small></div>
      <div><span>Price ÷ modeled forward EPS</span><strong>{number(model.last.price * 10 / currentEps, 2)}<em>×</em></strong><small>At the latest saved close</small></div>
    </div>
    <div className="vb-controls">
      <label className="vb-growth" htmlFor="band-growth">Annual EPS growth
        <span><input id="band-growth" type="number" min="-20" max="30" step="0.5" value={growthInput} aria-invalid={!validGrowth} aria-describedby="band-growth-help"
          onChange={event => {
            const value = event.target.value;
            setGrowthInput(value);
            if (value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= -20 && Number(value) <= 30) setGrowth(Number(value));
          }} /><span>%</span></span>
      </label>
      <div className="vb-horizon" role="group" aria-label="Projection horizon"><span>Project</span>{[1, 2, 3].map(years =>
        <button type="button" key={years} aria-pressed={horizon === years} onClick={() => { setHorizon(years); setSelectedMs(null); }}>{years}Y</button>)}</div>
      <div className="vb-unit" role="group" aria-label="Chart price scale">{[["spx", "S&P 500 proxy"], ["spy", "SPY"]].map(([value, label]) =>
        <button type="button" key={value} aria-pressed={unit === value} onClick={() => setUnit(value)}>{label}</button>)}</div>
    </div>
    <p className={`vb-help${validGrowth ? "" : " vb-invalid"}`} id="band-growth-help" role="status">
      {validGrowth ? `Bands use ${growth}% annual EPS growth for both historical reconstruction and future scenarios.` : "Enter a growth rate from −20% to 30%. The chart keeps the last valid value."}
    </p>
    <div className="vb-legend" aria-label="Chart legend">
      <span><i className="vb-key-price" />{priceLabel}{unit === "spx" ? " (SPY × 10)" : " close"}</span>
      <span><i className="vb-key-history" />Reconstructed bands</span>
      <span><i className="vb-key-projection" />Projected bands · {bandRange}</span>
    </div>
    <p className="vb-mobile-hint">Scroll the chart horizontally to explore the full timeline.</p>
    <div className="vb-chart-scroll" tabIndex={0} role="region" aria-label="Valuation bands chart. Scroll horizontally on small screens.">
      <svg className="vb-chart" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: `${width * 960 / 1100}px` }} role="img" aria-labelledby={`${uid}-title ${uid}-desc`}
        onPointerMove={event => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const chartX = (event.clientX - bounds.left) / bounds.width * width;
          const fraction = Math.max(0, Math.min(1, (chartX - PLOT.left) / (PLOT.right - PLOT.left)));
          setSelectedMs(model.start + fraction * (model.end - model.start));
        }} onPointerLeave={() => setSelectedMs(null)}>
        <title id={`${uid}-title`}>S&P 500 forward P/E valuation bands</title>
        <desc id={`${uid}-desc`}>Saved SPY closes{unit === "spx" ? " multiplied by ten as an approximate S&P 500 proxy" : ""}, with modeled {minPE} to {maxPE} times forward EPS bands in 2 times steps. Historical EPS is reconstructed; future EPS uses a {growth}% annual growth scenario. Each projection circle is labeled with its rounded implied price. Use the date slider below for exact values.</desc>
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--vb-teal)" stopOpacity="0.16" /><stop offset="100%" stopColor="var(--vb-teal)" stopOpacity="0" /></linearGradient>
          <clipPath id={`${uid}-clip`}><rect x={PLOT.left} y={PLOT.top} width={PLOT.right - PLOT.left} height={PLOT.bottom - PLOT.top} /></clipPath>
        </defs>
        <rect x={x(model.last.ms)} y={PLOT.top} width={PLOT.right - x(model.last.ms)} height={PLOT.bottom - PLOT.top} className="vb-projection-bg" />
        {yTicks.map(value => <g key={value}><line x1={PLOT.left} x2={PLOT.right} y1={y(value)} y2={y(value)} className="vb-grid" /><text x={PLOT.left - 14} y={y(value) + 5} textAnchor="end" className="vb-axis">{number(value)}</text></g>)}
        {xTicks.map(ms => <g key={ms}><line x1={x(ms)} x2={x(ms)} y1={PLOT.top} y2={PLOT.bottom} className="vb-grid vb-grid-vertical" /><text x={x(ms)} y={PLOT.bottom + 27} textAnchor="middle" className="vb-axis">{new Date(ms).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}<tspan x={x(ms)} dy="20">{new Date(ms).getUTCFullYear()}</tspan></text></g>)}
        <text x={PLOT.left} y="32" className="vb-region-label">RECONSTRUCTED EPS BANDS</text>
        <text x={x(model.last.ms) + 16} y="32" className="vb-region-label vb-purple">GROWTH SCENARIO · {growth}% / YEAR</text>
        <g clipPath={`url(#${uid}-clip)`}>
          <path d={`${pricePath} L${x(model.last.ms)},${PLOT.bottom} L${x(model.history[0].ms)},${PLOT.bottom} Z`} fill={`url(#${uid}-fill)`} />
          <path d={area(model.projected)} className="vb-band-fill" />
          {PE_MULTIPLES.map(pe => <g key={pe}>
            <path d={bandPath(model.historical, pe)} className="vb-historical-line" />
            <path d={bandPath(model.projected, pe)} className="vb-projected-line" />
          </g>)}
          <path d={pricePath} className="vb-price-line" />
          <line x1={x(model.last.ms)} x2={x(model.last.ms)} y1={PLOT.top} y2={PLOT.bottom} className="vb-cutoff" />
          <line x1={x(selected.ms)} x2={x(selected.ms)} y1={PLOT.top} y2={PLOT.bottom} className="vb-crosshair" />
          {selected.price !== null && <g>
            <circle cx={x(selected.ms)} cy={y(selected.price * 10 * scale)} r="4.5" className="vb-price-point" />
            <text x={x(selected.ms) + (x(selected.ms) < PLOT.left + 36 ? 8 : -8)} y={y(selected.price * 10 * scale) - 11} textAnchor={x(selected.ms) < PLOT.left + 36 ? "start" : "end"} className="vb-point-value vb-price-value">{formatMarker(selected.price * 10 * scale)}</text>
          </g>}
        </g>
        {PE_MULTIPLES.map(pe => projectionMarkers.map(point => <g key={`${pe}-${point.ms}`} className="vb-projection-marker" data-pe={pe} data-ms={point.ms}>
          <title>{date(point.ms)} · {pe}× · {format(point.eps * pe * scale)}</title>
          <circle cx={x(point.ms)} cy={y(point.eps * pe * scale)} r="3" className="vb-projection-point" />
          <text x={x(point.ms)} y={y(point.eps * pe * scale) - 10} textAnchor="middle" className="vb-point-value">{formatMarker(point.eps * pe * scale)}</text>
        </g>))}
        {bandLabels.map(({ pe, position }) => <g key={pe} className="vb-end-marker" data-pe={pe} data-ms={model.end}>
          <title>{date(model.end)} · {pe}× · {format(endEps * pe * scale)}</title>
          <circle cx={PLOT.right} cy={y(endEps * pe * scale)} r="3" className="vb-projection-point" />
          <line x1={PLOT.right + 4} y1={y(endEps * pe * scale)} x2={PLOT.right + 12} y2={position} className="vb-label-leader" />
          <text x={PLOT.right + 16} y={position + 5} className="vb-band-label">{pe}×<tspan dx="7" className="vb-end-value">{formatMarker(endEps * pe * scale)}</tspan></text>
        </g>)}
      </svg>
    </div>
    <div className="vb-inspector" aria-live="off">
      <div><span>{future ? "Projected scenario" : "Saved price / modeled bands"}</span><strong>{date(selected.ms)}</strong></div>
      <div><span>{priceLabel}</span><strong>{selected.price === null ? "—" : format(selected.price * 10 * scale)}</strong></div>
      <div><span>Modeled index EPS</span><strong>${number(selectedEps, 2)}</strong></div>
      <div><span>{bandRange} range</span><strong>{format(selectedEps * minPE * scale)} – {format(selectedEps * maxPE * scale)}</strong></div>
    </div>
    <label className="vb-scrubber" htmlFor="band-inspect">Inspect date
      <input id="band-inspect" type="range" min={model.start} max={model.end} step={86400000} value={inspectMs}
        aria-valuetext={`${date(selected.ms)}. ${future ? "Projected scenario" : `${priceLabel} ${format(selected.price! * 10 * scale)}`}. Modeled index EPS ${number(selectedEps, 2)}. ${minPE} to ${maxPE} times range ${format(selectedEps * minPE * scale)} to ${format(selectedEps * maxPE * scale)}.`}
        onChange={event => setSelectedMs(Number(event.target.value))} />
    </label>
    <footer className="vb-footer">
      <p><strong>How to read this:</strong> Each band = modeled 12-month forward index EPS × the labeled P/E multiple{unit === "spy" ? ", divided by 10 for approximate SPY prices" : ""}. Historical bands are reconstructed from the saved EPS anchor using your growth assumption; they are not historical analyst estimates. Future bands are scenarios, not analyst forecasts or price targets.</p>
      <p>Price data: saved SPY closes{unit === "spx" ? " × 10 (an approximate S&P 500 proxy, not the index itself)" : ""}. EPS anchor: {anchor.sourceUrl ? <a href={anchor.sourceUrl} target="_blank" rel="noreferrer">{anchor.source}</a> : anchor.source}, {date(anchor.ms)}. The anchor is approximate: report reference index close ÷ rounded reported forward P/E.</p>
    </footer>
  </>;
}
