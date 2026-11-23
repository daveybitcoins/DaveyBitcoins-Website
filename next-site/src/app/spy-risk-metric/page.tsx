import type { Metadata } from "next";
import Script from "next/script";
import { spyRiskEngineSrc } from "@/lib/spy-risk-asset";
import { RiskSectionNav } from "@/components/risk-section-nav";
import { ValuationBands } from "@/components/valuation-bands";

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
  ["price-chart", "Price chart"],
  ["risk-scenarios", "Risk scenarios"],
  ["valuation-bands", "Valuation bands"],
  ["historic-events", "Historic events"],
  ["vix-chart", "VIX chart"],
  ["dcaSection", "DCA simulator"],
  ["methodology", "Methodology"],
] as const;

export default function SpyRiskMetricPage() {
  return (
    <main id="main-content" tabIndex={-1} className="spy-page risk-page-with-sections" data-risk-dashboard="spy">
      <RiskSectionNav links={sectionLinks} />
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

        <section className="dashboard" id="summary" aria-label="SPY market summary">
          <article className="card card-price">
            <div className="card-label">SPY / USD · Model price</div>
            <div className="card-value card-value--price" id="vPrice">
              —
            </div>
            <div id="vFwdPE" className="card-detail card-detail--gold" />
          </article>
          <article className="card risk-card" id="riskCard">
            <div className="card-label">Market Cycle Risk</div>
            <div className="card-value" id="vRisk">
              —
            </div>
            <div className="current-risk-zone" id="vRiskZone">—</div>
            <div className="risk-bar-wrap" id="riskBar" role="meter" aria-label="Current SPY risk" aria-valuemin={0} aria-valuemax={1}>
              <div className="risk-bar-bg" />
              <div className="risk-bar-needle" id="needle" />
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

        <section className="spy-panel chart-panel" id="price-chart">
          <div className="chart-header">
            <div>
              <h2 className="chart-label">
                SPY — Price Colored by Risk (Log Scale)
              </h2>
            </div>
            <div className="chart-note">200-Week Moving Average</div>
          </div>
          <canvas aria-label="Price history colored by risk" role="img" id="priceCanvas" width="1380" height="540" />
          <Tooltip id="priceTip" valueLabel="Risk" />
          <div className="legend-bar" id="legendBar" />
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
          <p className="risk-scenario-context" id="riskScenarioContext" />
          <div className="risk-table" id="riskTable" />
          <p className="spy-disclosure">
            Statistical scenarios—not price targets.
          </p>
        </section>

        <ValuationBands />

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
                  <th>SPY Price</th>
                  <th>Risk</th>
                  <th>VIX High</th>
                  <th>1Y Price Return</th>
                  <th>2Y Price Return</th>
                  <th>3Y Price Return</th>
                </tr>
              </thead>
              <tbody id="riskLowsBody" />
            </table>
          </div>
          <p className="spy-disclosure historic-event-note">
            The Jensen Huang resignation row records the November 20, 2026 market close
            following NVIDIA’s November 12 announcement. VIX uses the daily intraday high.{" "}
            <a href="https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Announces-CEO-Transition/default.aspx" target="_blank" rel="noreferrer">NVIDIA announcement</a>{" · "}
            <a href="https://www.cboe.com/tradable-products/vix/vix-historical-data" target="_blank" rel="noreferrer">Cboe VIX history</a>
          </p>
        </section>

        <section className="spy-panel chart-panel" id="vix-chart">
          <div className="chart-header">
            <div>
              <h2 className="chart-label">VIX — Fear Index</h2>
            </div>
            <div className="chart-note">
              1993+ history · shaded = ≥10% SPY drawdown windows
            </div>
          </div>
          <canvas aria-label="VIX history" role="img" id="vixCanvas" width="1380" height="280" />
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
                1x every period. Every strategy receives the same base contribution each period; purchases are capped by available cash. Skipped funds earn 0%. Signals use the previous trading observation. Matched fixed DCA invests each contribution immediately. Reinvested distributions are included before fees and taxes. Gain percentages are cumulative, not annualized.
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
                <canvas aria-label="Simulated portfolio value" role="img" id="dcaPortfolioCanvas" width="1380" height="420" />
                <Tooltip id="dcaPortfolioTip" valueLabel="Return" />
              </div>
              <div className="dca-chart">
                <div className="chart-header">
                  <h3 className="chart-label">Simulated Strategy Over Time</h3>
                  <div className="chart-note">
                    Buy zones shaded by multiplier intensity
                  </div>
                </div>
                <canvas aria-label="Simulated strategy history" role="img" id="dcaStrategyCanvas" width="1380" height="300" />
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
                        <th>SPY Close</th>
                        <th>Prior Risk</th>
                        <th>Actual Mult.</th>
                        <th>Invested</th>
                        <th>Cum. Invested</th>
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
              update in the following calendar week and carry across daily observations.
            </p>
            <p>
              <span className="hl">Percentile Normalization:</span> Each reading
              uses only prior calendar weeks, with the same policy throughout history. The first 200 weeks are warmup; the full 20-year percentile window is available from late 2016. This is a relative trend percentile, not a probability of loss.
            </p>
            <p>
              <span className="hl">Risk Prices:</span> Prices are statistical
              scenarios using the current 200W average—not price targets.
            </p>
            <p>
              <span className="hl">Price &amp; VIX History:</span> SPY and VIX use
              actual history from January 1993. Prices exclude dividend adjustments; DCA includes reinvested distributions. Pre-inception proxy data is excluded.
            </p>
          </div>
        </section>

        <p className="spy-footer">Educational tools only · Not financial advice</p>
      </div>
      <Script
        src={spyRiskEngineSrc}
        strategy="afterInteractive"
      />
    </main>
  );
}
