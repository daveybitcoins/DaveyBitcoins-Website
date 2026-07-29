import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "SPY Risk Metric | DaveyBitcoins",
  description:
    "SPY market-cycle risk using the trailing percentile of price deviation from its 200-week moving average, aligned with VIX and market drawdowns.",
  alternates: {
    canonical: "/spy-risk-metric/",
  },
  openGraph: {
    title: "SPY Risk Metric — DaveyBitcoins",
    description:
      "SPY risk, valuation scenarios, market history, and a risk-based DCA simulator.",
    url: "/spy-risk-metric/",
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

export default function SpyRiskMetricPage() {
  return (
    <main className="spy-page" data-risk-dashboard="spy">
      <div className="spy-container">
        <header className="spy-intro">
          <p className="spy-kicker">Market cycle dashboard · Updated daily</p>
          <h1>
            SPY <span>Risk Metric</span>
          </h1>
          <p className="spy-subtitle">
            <span className="live-dot" />
            Risk · 200-Week Trend-Deviation Percentile
          </p>
          <div id="headerDate" className="spy-date">
            Loading market history…
          </div>
        </header>

        <section className="dashboard" aria-label="SPY market summary">
          <article className="card card-price">
            <div className="card-label">SPY / USD</div>
            <div className="card-value card-value--price" id="vPrice">
              —
            </div>
            <div id="vFwdPE" className="card-detail card-detail--gold" />
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

        <section className="spy-panel risk-table-wrap">
          <div className="spy-section-heading">
            <div>
              <p className="spy-section-index">01 / Risk map</p>
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

        <section className="spy-panel pe-proj-wrap valuation-stress-wrap">
          <div className="spy-section-heading">
            <div>
              <p className="spy-section-index">02 / Valuation</p>
              <h2>Valuation-Aware Downside Scenarios</h2>
            </div>
            <p>
              15× forward P/E scenario floor · Earnings estimates decline with
              the severity of the downturn.
            </p>
          </div>
          <div className="spy-table-scroll">
            <table className="pe-proj-table" id="valuationStressTable">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>EPS Change</th>
                  <th>Forward EPS</th>
                  <th>P/E Assumption</th>
                  <th>Implied SPY</th>
                  <th>Vs. Current</th>
                </tr>
              </thead>
              <tbody id="valuationStressBody" />
            </table>
          </div>
          <p className="spy-disclosure">
            Uses the July 2026 forward EPS anchor of $373.08. The 15× multiple
            is a valuation scenario—not a guaranteed market floor.
          </p>
        </section>

        <section className="spy-panel pe-proj-wrap">
          <div className="spy-section-heading">
            <div>
              <p className="spy-section-index">03 / Earnings</p>
              <h2>Forward P/E Price Projections</h2>
            </div>
            <p className="pe-current-context" id="peCurrentContext" />
          </div>
          <div className="pe-controls">
            <label htmlFor="epsGrowthInput">Post-2027 EPS growth</label>
            <div>
              <input
                type="number"
                id="epsGrowthInput"
                defaultValue="8"
                min="0"
                max="20"
                step="0.5"
                aria-label="Post-2027 EPS growth percentage"
              />
              <span>% Y-o-Y scenario · SPY ≈ SPX ÷ 10</span>
            </div>
            <span
              className="pe-growth-status"
              id="epsGrowthStatus"
              aria-live="polite"
            />
          </div>
          <div
            className="pe-growth-presets"
            aria-label="Post-2027 EPS growth presets"
          >
            <button type="button" className="pe-growth-preset" data-growth="4">
              4%
            </button>
            <button type="button" className="pe-growth-preset" data-growth="6">
              6%
            </button>
            <button
              type="button"
              className="pe-growth-preset active"
              data-growth="8"
            >
              8% default
            </button>
            <button type="button" className="pe-growth-preset" data-growth="10">
              10%
            </button>
            <button type="button" className="pe-growth-preset" data-growth="12">
              12%
            </button>
          </div>
          <div className="spy-table-scroll">
            <table className="pe-proj-table" id="peProjTable">
              <thead id="peProjHead" />
              <tbody id="peProjBody" />
            </table>
          </div>
          <p className="spy-disclosure">
            2025 actual EPS: $271.23 ·{" "}
            <a
              href="https://advantage.factset.com/hubfs/Website/Resources%20Section/Research%20Desk/Earnings%20Insight/EarningsInsight_072426.pdf"
              target="_blank"
              rel="noopener noreferrer"
            >
              FactSet Jul 24, 2026
            </a>{" "}
            consensus: CY2026 +27.3% (~$345), CY2027 +15.3% (~$398) · 2028+
            default scenario: 8% · Next review: Oct 2026
          </p>
        </section>

        <section className="spy-panel risk-lows-wrap">
          <div className="spy-section-heading">
            <div>
              <p className="spy-section-index">04 / History</p>
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
                  <th>SPY Price</th>
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

        <section className="spy-panel chart-panel">
          <div className="chart-header">
            <div>
              <p className="spy-section-index">05 / Price</p>
              <h2 className="chart-label">
                SPY — Price Colored by Risk (Log Scale)
              </h2>
            </div>
            <div className="chart-note">200-Week Moving Average</div>
          </div>
          <canvas id="priceCanvas" width="1380" height="540" />
          <Tooltip id="priceTip" valueLabel="Risk" />
          <div className="legend-bar" id="legendBar" />
        </section>

        <section className="spy-panel chart-panel">
          <div className="chart-header">
            <div>
              <p className="spy-section-index">06 / Cycle</p>
              <h2 className="chart-label">200W Risk Oscillator (0 – 1)</h2>
            </div>
            <div className="chart-note">
              Weekly risk only · 1990+ aligned with VIX · shaded = ≥10%
              drawdown windows
            </div>
          </div>
          <canvas id="riskCanvas" width="1380" height="340" />
          <Tooltip id="riskTip" valueLabel="Risk" />
        </section>

        <section className="spy-panel chart-panel">
          <div className="chart-header">
            <div>
              <p className="spy-section-index">07 / Volatility</p>
              <h2 className="chart-label">VIX — Fear Index</h2>
            </div>
            <div className="chart-note">
              Same 1990+ time axis · shaded = ≥10% SPY drawdown windows
            </div>
          </div>
          <canvas id="vixCanvas" width="1380" height="280" />
          <Tooltip id="vixTip" valueLabel="VIX" />
        </section>

        <section className="spy-panel chart-panel" id="dcaSection">
          <div className="chart-header">
            <div>
              <p className="spy-section-index">08 / Backtest</p>
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

        <section className="spy-panel methodology">
          <div className="spy-section-heading">
            <div>
              <p className="spy-section-index">Methodology</p>
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
              charts begin with reliable VIX history in 1990 and share the same
              date range.
            </p>
            <p>
              <span className="hl">Valuation-Aware Downside:</span> Applies a
              15× forward P/E scenario after explicit earnings shocks.
            </p>
          </div>
        </section>

        <p className="spy-footer">Educational tools only · Not financial advice</p>
      </div>
      <Script src="/spy-risk-engine.js" strategy="afterInteractive" />
    </main>
  );
}
