import type { Metadata } from "next";
import Script from "next/script";
import { RiskSectionNav } from "@/components/risk-section-nav";

export const metadata: Metadata = {
  title: "QQQ Risk Metric | DaveyBitcoins",
  description:
    "QQQ market-cycle risk using the trailing percentile of price deviation from its 200-week moving average, aligned with VIX and market drawdowns.",
  alternates: {
    canonical: "/qqq-risk-metric/",
  },
  openGraph: {
    title: "QQQ Risk Metric — DaveyBitcoins",
    description:
      "QQQ market-cycle risk, historic events, and a risk-based DCA simulator.",
    url: "/qqq-risk-metric/",
    images: ["/social-preview.png"],
  },
};

function Tooltip({
  id,
  valueLabel,
}: {
  id: string;
  valueLabel: string;
}) {
  return (
    <div className="tooltip" id={id}>
      <div className="tt-date" />
      <div className="tt-price" />
      <div>
        {valueLabel}: <span className="tt-risk" />
      </div>
    </div>
  );
}

const sectionLinks = [
  ["summary", "Summary"],
  ["risk-scenarios", "Risk scenarios"],
  ["historic-events", "Historic events"],
  ["price-chart", "Price chart"],
  ["risk-oscillator", "Risk oscillator"],
  ["vix-chart", "VIX chart"],
  ["dcaSection", "DCA simulator"],
  ["methodology", "Methodology"],
] as const;

export default function QqqRiskMetricPage() {
  return (
    <main
      className="spy-page qqq-page risk-page-with-sections"
      data-risk-dashboard="qqq"
    >
      <RiskSectionNav links={sectionLinks} />
      <div className="spy-container">
        <header className="spy-intro">
          <p className="spy-kicker">Market cycle dashboard · Updated daily</p>
          <h1>
            QQQ <span>Risk Metric</span>
          </h1>
          <p className="spy-subtitle">
            <span className="live-dot" />
            Risk · 200-Week Trend-Deviation Percentile
          </p>
          <div id="headerDate" className="spy-date">
            Loading market history…
          </div>
        </header>

        <section className="dashboard" id="summary" aria-label="QQQ market summary">
          <article className="card card-price">
            <div className="card-label">QQQ / USD</div>
            <div className="card-value card-value--price" id="vPrice">
              —
            </div>
          </article>
          <article className="card">
            <div className="card-label">Market Cycle Risk</div>
            <div className="card-value" id="vRisk">
              —
            </div>
            <div className="risk-bar-wrap">
              <div className="risk-bar-bg" />
              <div className="risk-bar-needle" id="needle" />
            </div>
            <div className="zone-labels">
              <span>Accumulate</span>
              <span>Neutral</span>
              <span>Caution</span>
            </div>
          </article>
          <article className="card">
            <div className="card-label">200-Week Trend</div>
            <div className="card-value" id="vFair">
              —
            </div>
            <div className="card-sub" id="vGrowth" />
          </article>
          <article className="card">
            <div className="card-label">Vs. 200W MA</div>
            <div className="card-value" id="vDev">
              —
            </div>
          </article>
          <article className="card">
            <div className="card-label">VIX (Close)</div>
            <div className="card-value" id="vVixLevel">
              —
            </div>
            <div className="card-sub" id="vVixImplied" />
          </article>
        </section>

        <section className="spy-panel risk-table-wrap" id="risk-scenarios">
          <div className="spy-section-heading">
            <div>
              <h2>Risk Price Scenarios</h2>
            </div>
            <p>
              Prices solve for each risk decile using the current long-term
              trend and trailing 20-year weekly deviation distribution.
            </p>
          </div>
          <div className="risk-table" id="riskTable" />
          <p className="spy-disclosure">
            Statistical scenarios—not price targets.
          </p>
        </section>

        <section className="spy-panel risk-lows-wrap" id="historic-events">
          <div className="spy-section-heading">
            <div>
              <h2>Notable Historic Market Events</h2>
            </div>
            <p>
              How risk, volatility, and forward returns behaved around major
              periods of market stress.
            </p>
          </div>
          <div className="spy-table-scroll">
            <table className="risk-lows-table" id="riskLowsTable">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Event</th>
                  <th>QQQ Price</th>
                  <th>Risk</th>
                  <th>VIX High</th>
                  <th>1Y Return</th>
                  <th>2Y Return</th>
                  <th>3Y Return</th>
                </tr>
              </thead>
              <tbody id="riskLowsBody" />
            </table>
          </div>
        </section>

        <section className="spy-panel chart-panel" id="price-chart">
          <div className="chart-header">
            <div>
              <h2 className="chart-label">
                QQQ — Price Colored by Risk (Log Scale)
              </h2>
            </div>
            <div className="chart-note">200-Week Moving Average</div>
          </div>
          <canvas id="priceCanvas" width="1380" height="540" />
          <Tooltip id="priceTip" valueLabel="Risk" />
          <div className="legend-bar" id="legendBar" />
        </section>

        <section className="spy-panel chart-panel" id="risk-oscillator">
          <div className="chart-header">
            <div>
              <h2 className="chart-label">200W Risk Oscillator (0 – 1)</h2>
            </div>
            <div className="chart-note">
              Weekly risk only · 200W history aligned with VIX · shaded = ≥10%
              drawdown windows
            </div>
          </div>
          <canvas id="riskCanvas" width="1380" height="340" />
          <Tooltip id="riskTip" valueLabel="Risk" />
        </section>

        <section className="spy-panel chart-panel" id="vix-chart">
          <div className="chart-header">
            <div>
              <h2 className="chart-label">VIX — Fear Index</h2>
            </div>
            <div className="chart-note">
              Same aligned time axis · shaded = ≥10% QQQ drawdown windows
            </div>
          </div>
          <canvas id="vixCanvas" width="1380" height="280" />
          <Tooltip id="vixTip" valueLabel="VIX" />
        </section>

        <section className="spy-panel chart-panel" id="dcaSection">
          <div className="chart-header">
            <div>
              <h2 className="chart-label">DCA Simulator</h2>
            </div>
            <div className="chart-note">
              Risk-Based Dollar Cost Averaging Backtest
            </div>
          </div>
          <div id="dcaBody">
            <div id="dcaConfig">
              <div className="dca-row">
                <label>
                  USD Amount “x”
                  <input
                    type="number"
                    id="dcaAmount"
                    defaultValue="1000"
                    min="1"
                    step="100"
                  />
                </label>
                <label>
                  Repeat Purchase
                  <select id="dcaFrequency" defaultValue="monthly">
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </label>
                <label>
                  Day of Month
                  <input
                    type="number"
                    id="dcaDayOfMonth"
                    defaultValue="1"
                    min="1"
                    max="28"
                  />
                </label>
              </div>
              <div className="dca-row">
                <label>
                  Start Date
                  <input type="date" id="dcaStart" />
                </label>
                <label>
                  End Date
                  <input type="date" id="dcaEnd" />
                </label>
              </div>
              <div className="dca-row">
                <label>
                  Accumulate up to Risk
                  <select id="dcaRiskThreshold" />
                </label>
                <label>
                  Buying Strategy
                  <span className="dca-toggle-group" id="dcaStrategyToggle">
                    <button
                      type="button"
                      className="zoom-btn active"
                      data-val="linear"
                    >
                      Linear
                    </button>
                    <button
                      type="button"
                      className="zoom-btn"
                      data-val="exponential"
                    >
                      Exponential
                    </button>
                    <button
                      type="button"
                      className="zoom-btn"
                      data-val="fixed"
                    >
                      Fixed
                    </button>
                  </span>
                </label>
                <label>
                  Scale
                  <span className="dca-toggle-group" id="dcaScaleToggle">
                    <button
                      type="button"
                      className="zoom-btn active"
                      data-val="lin"
                    >
                      Lin
                    </button>
                    <button
                      type="button"
                      className="zoom-btn"
                      data-val="log"
                    >
                      Log
                    </button>
                  </span>
                </label>
              </div>
              <p className="dca-note">
                Linear: x, 2x, 3x, 4x · Exponential: x, 2x, 4x, 8x · Fixed:
                1x every period
              </p>
              <button type="button" className="zoom-btn" id="dcaRunBtn">
                Run Simulation
              </button>
            </div>
            <div
              className="dca-stats"
              id="dcaStats"
              style={{ display: "none" }}
            />
            <div id="dcaChartsWrap" style={{ display: "none" }}>
              <div className="dca-chart">
                <div className="chart-header">
                  <h3 className="chart-label">
                    Simulated Portfolio Value Over Time
                  </h3>
                  <div className="chart-note" id="dcaBuyNote" />
                </div>
                <canvas id="dcaPortfolioCanvas" width="1380" height="420" />
                <Tooltip id="dcaPortfolioTip" valueLabel="Return" />
              </div>
              <div className="dca-chart">
                <div className="chart-header">
                  <h3 className="chart-label">Simulated Strategy Over Time</h3>
                  <div className="chart-note">
                    Buy zones shaded by multiplier intensity
                  </div>
                </div>
                <canvas id="dcaStrategyCanvas" width="1380" height="300" />
                <Tooltip id="dcaStrategyTip" valueLabel="Risk" />
              </div>
              <div id="dcaTradesWrap">
                <h3 className="chart-label">Simulated Trade History</h3>
                <div className="spy-table-scroll">
                  <table className="risk-lows-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Date</th>
                        <th>Price</th>
                        <th>Risk</th>
                        <th>Mult</th>
                        <th>USD Spent</th>
                        <th>Shares</th>
                        <th>Cum. Shares</th>
                        <th>Portfolio</th>
                      </tr>
                    </thead>
                    <tbody id="dcaTradesBody" />
                  </table>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="spy-panel methodology" id="methodology">
          <div className="spy-section-heading">
            <div>
              <h2>How the model works</h2>
            </div>
            <p>
              A weekly-only framework intended to measure long-term market
              position, not short-term direction.
            </p>
          </div>
          <div className="methodology-grid">
            <p>
              <span className="hl">200-Week Risk:</span> Calculates{" "}
              <code>ln(price ÷ 200W MA)</code> from weekly closes, then ranks
              that deviation against its trailing 20-year weekly history.
            </p>
            <p>
              <span className="hl">Weekly Updates:</span> Historical readings
              change at each weekly close and carry across intervening daily
              observations.
            </p>
            <p>
              <span className="hl">Percentile Normalization:</span> Each reading
              uses only information available on that date, avoiding look-ahead
              bias.
            </p>
            <p>
              <span className="hl">Risk Prices:</span> Prices are statistical
              scenarios using the current 200W average—not price targets.
            </p>
            <p>
              <span className="hl">Risk / VIX Alignment:</span> Both comparison
              charts begin when QQQ has a valid 200W reading and VIX data, then
              share the same date range.
            </p>
            <p>
              <span className="hl">VIX Chart:</span> Volatility is shown as a
              fear and greed reference; it is not part of the risk calculation.
            </p>
          </div>
        </section>

        <p className="spy-footer">Educational tools only · Not financial advice</p>
      </div>
      <Script src="/qqq-risk-engine.js" strategy="afterInteractive" />
    </main>
  );
}
