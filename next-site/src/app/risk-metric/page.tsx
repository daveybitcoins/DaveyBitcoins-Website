import type { Metadata } from "next";
import Image from "next/image";
import Script from "next/script";
import { RiskSectionNav } from "@/components/risk-section-nav";

export const metadata: Metadata = {
  title: "Bitcoin Risk Metric | DaveyBitcoins",
  description:
    "Bitcoin structural and momentum risk using power-law regression, cycle data, market-cap scenarios, and projections through 2040.",
  alternates: {
    canonical: "/risk-metric/",
  },
  openGraph: {
    title: "Bitcoin Risk Metric — DaveyBitcoins",
    description:
      "Bitcoin combined risk, weekly moving averages, cycle context, and market-cap-adjusted fair value.",
    url: "/risk-metric/",
    images: ["/social-preview.png"],
  },
};

function ProgressCard({
  className,
  label,
  valueId,
  subId,
  initialSub,
  progressClass,
  progressId,
  leftId,
  leftText,
  rightId,
  rightText,
}: {
  className: string;
  label: string;
  valueId: string;
  subId: string;
  initialSub: string;
  progressClass: string;
  progressId: string;
  leftId: string;
  leftText: string;
  rightId: string;
  rightText: string;
}) {
  return (
    <article className={`card ${className}`}>
      <div className="card-label">{label}</div>
      <div className="card-value" id={valueId}>
        —
      </div>
      <div className="card-sub" id={subId}>
        {initialSub}
      </div>
      <div className={`${progressClass}-progress`}>
        <div
          className={`${progressClass}-progress-bar`}
          id={progressId}
        />
      </div>
      <div className={`${progressClass}-meta`}>
        <span id={leftId}>{leftText}</span>
        <span id={rightId}>{rightText}</span>
      </div>
    </article>
  );
}

function Tooltip({
  id,
  valueLabel,
  showPrice = true,
}: {
  id: string;
  valueLabel?: string;
  showPrice?: boolean;
}) {
  return (
    <div className="tooltip" id={id}>
      <div className="tt-date" />
      {showPrice && <div className="tt-price" />}
      {valueLabel && (
        <div>
          <span className="tt-risk-label">{valueLabel}:</span>{" "}
          <span className="tt-risk" />
        </div>
      )}
    </div>
  );
}

const movingAverages = [300, 200, 50, 21, 13, 8];

const sectionLinks = [
  ["summary", "Summary"],
  ["movingAveragesCard", "Moving averages"],
  ["model-snapshot", "Model snapshot"],
  ["risk-levels", "Risk levels"],
  ["market-caps", "Market caps"],
  ["fair-value", "Fair value"],
  ["historical-lows", "Historical lows"],
  ["price-chart", "Price chart"],
  ["risk-oscillator", "Risk oscillator"],
  ["midterm-cycles", "Midterm cycles"],
  ["methodology", "Methodology"],
] as const;

export default function BitcoinRiskMetricPage() {
  return (
    <main className="spy-page btc-page risk-page-with-sections" data-risk-dashboard="btc">
      <RiskSectionNav links={sectionLinks} />
      <div className="spy-container">
        <header className="spy-intro btc-intro">
          <div className="btc-intro-copy">
            <p className="spy-kicker">Bitcoin cycle dashboard · Updated daily</p>
            <h1>
              Bitcoin <span>Risk Metric</span>
            </h1>
            <p className="spy-subtitle">
              <span className="live-dot" />
              Combined Structural + Momentum · Power-Law Regression · Math ·
              Patience
            </p>
            <div id="headerDate" className="spy-date">
              Loading Bitcoin history…
            </div>
          </div>
          <figure className="btc-intro-art">
            <Image
              src="/social-preview.png"
              alt="A glowing Bitcoin clock in a futuristic golden landscape"
              fill
              sizes="(max-width: 1200px) 100vw, 440px"
              priority
            />
            <figcaption>
              <strong>Bitcoin // Time, cycles &amp; risk</strong>
              <span>A visual map for the long game.</span>
            </figcaption>
          </figure>
        </header>

        <section className="dashboard" id="summary" aria-label="Bitcoin market summary">
          <article className="card card-price">
            <div className="card-label">BTC Price</div>
            <div className="card-value card-value--price" id="vPrice">
              —
            </div>
            <div className="card-sub" id="vPriceTime" />
          </article>
          <article className="card risk-card" id="riskCard">
            <div className="card-label">Combined Risk</div>
            <div className="card-value risk-value" id="vRisk">
              —
            </div>
            <div
              className="risk-bar-wrap"
              id="riskBar"
              role="meter"
              aria-label="Current Bitcoin combined risk"
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={0}
            >
              <div className="risk-bar-bg" />
              <div className="risk-bar-needle" id="needle" />
            </div>
            <div className="zone-labels">
              <span data-risk-zone="Accumulate">Accumulate</span>
              <span data-risk-zone="Neutral">Neutral</span>
              <span data-risk-zone="Caution">Caution</span>
              <span data-risk-zone="Euphoria">Euphoria</span>
            </div>
          </article>
          <article className="card">
            <div className="card-label">Fair Value</div>
            <div className="card-value" id="vFair">
              —
            </div>
            <div className="card-sub" id="vGrowth" />
          </article>
          <article className="card">
            <div className="card-label">Deviation</div>
            <div className="card-value" id="vDev">
              —
            </div>
            <div className="card-sub" id="vPoints" />
          </article>
          <ProgressCard
            className="halving-card"
            label="Next Halving"
            valueId="vHalvingDays"
            subId="vHalvingSub"
            initialSub="Fetching block height…"
            progressClass="halving"
            progressId="halvingProgressBar"
            leftId="vHalvingBlocks"
            leftText="— blocks"
            rightId="vHalvingProgress"
            rightText="—% epoch"
          />
          <ProgressCard
            className="difficulty-card"
            label="Mining Difficulty"
            valueId="vDifficulty"
            subId="vDifficultySub"
            initialSub="Fetching adjustment…"
            progressClass="difficulty"
            progressId="difficultyProgressBar"
            leftId="vDifficultyBlocks"
            leftText="— blocks"
            rightId="vDifficultyAth"
            rightText="ATH —"
          />
          <ProgressCard
            className="bear-card"
            label="Bear Market Progress"
            valueId="vBearPct"
            subId="vBearSub"
            initialSub="Cycle timing estimate"
            progressClass="bear"
            progressId="bearProgressBar"
            leftId="vBearTarget"
            leftText="—"
            rightId="vBearRange"
            rightText="—"
          />
        </section>

        <section className="card moving-averages-card" id="movingAveragesCard">
          <div className="moving-averages-head">
            <div className="card-label">Major Weekly Moving Averages</div>
            <div className="card-sub" id="movingAveragesAsOf">
              Weekly closes · latest week-to-date included
            </div>
          </div>
          <div className="moving-averages-grid">
            {movingAverages.map((period) => (
              <div className="moving-average-item" key={period}>
                <div className="moving-average-period">{period}W</div>
                <div className="moving-average-value" id={`vMa${period}W`}>
                  —
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="spy-panel model-snapshot" id="model-snapshot">
          <div className="model-snapshot-head">
            <div>
              <h2>Model Snapshot &amp; Historical Check</h2>
              <p>
                Current components, exact zone definitions, and descriptive
                one-year outcomes from monthly historical snapshots.
              </p>
            </div>
            <button
              type="button"
              className="snapshot-refresh"
              id="refreshRiskSnapshot"
            >
              Refresh coherent snapshot
            </button>
          </div>
          <div className="model-snapshot-grid">
            <div>
              <span>Structural</span>
              <strong id="vStructuralRisk">—</strong>
            </div>
            <div>
              <span>Momentum</span>
              <strong id="vMomentumRisk">—</strong>
            </div>
            <div>
              <span>Combined / Zone</span>
              <strong id="vCombinedZone">—</strong>
            </div>
            <div>
              <span>Momentum Window</span>
              <strong id="vMomentumWindow">—</strong>
            </div>
            <div>
              <span>Regression Slope</span>
              <strong id="vRegressionSlope">—</strong>
            </div>
            <div>
              <span>Model Version</span>
              <strong>2026.08</strong>
            </div>
          </div>
          <div className="model-backtest-scroll">
            <table className="model-backtest-table" id="modelBacktestTable">
              <thead>
                <tr>
                  <th>Risk Zone</th>
                  <th>Monthly Samples</th>
                  <th>Median 1Y Return</th>
                  <th>Positive 1Y</th>
                  <th>Median Max Drawdown</th>
                </tr>
              </thead>
              <tbody id="modelBacktestBody" />
            </table>
          </div>
          <p className="model-snapshot-note" id="modelSnapshotNote">
            Historical monthly observations overlap and are descriptive, not
            independent forecasts.
          </p>
        </section>

        <section className="spy-panel risk-table-wrap" id="risk-levels">
          <div className="spy-section-heading">
            <div>
              <h2>Price at Each Risk Level (Combined)</h2>
            </div>
            <p>
              Structural and momentum risk combined across Bitcoin&apos;s
              long-term power-law model.
            </p>
          </div>
          <div className="risk-table" id="riskTable" />
        </section>

        <section className="spy-panel proj-table-wrap" id="market-caps">
          <div className="spy-section-heading">
            <div>
              <h2>BTC Price at Market Caps</h2>
            </div>
            <p>
              Converts market-cap milestones into a per-Bitcoin price using the
              current circulating supply.
            </p>
          </div>
          <div className="market-cap-meta">
            <div>
              Mined Supply Estimate: <span id="currentSupply">—</span>
            </div>
            <div>
              Block Height: <span id="currentSupplyHeight">—</span>
            </div>
          </div>
          <div className="market-cap-scroll">
            <table className="proj-table" id="marketCapTable">
              <thead>
                <tr>
                  <th>Market Cap</th>
                  <th>BTC Price</th>
                  <th>Move from Today</th>
                </tr>
              </thead>
              <tbody id="marketCapBody" />
            </table>
          </div>
        </section>

        <section className="spy-panel proj-table-wrap" id="fair-value">
          <div className="spy-section-heading">
            <div>
              <h2>Bitcoin Market-Cap-Adjusted Power-Law Fair Value</h2>
            </div>
            <p>
              A maturity-adjusted long-run scenario extending Bitcoin&apos;s
              historical power-law path through 2040.
            </p>
          </div>
          <div
            className="fair-value-scenarios"
            role="group"
            aria-label="Fair value projection scenario"
          >
            <button
              type="button"
              className="fair-value-scenario"
              data-fair-value-scenario="conservative"
              aria-pressed="false"
            >
              <strong>Conservative</strong>
              <span>
                <span className="scenario-cap">$15T · end-2025</span> Investable
                gold including derivatives
              </span>
            </button>
            <button
              type="button"
              className="fair-value-scenario"
              data-fair-value-scenario="base"
              aria-pressed="true"
            >
              <strong>Base</strong>
              <span>
                <span className="scenario-cap">$23T · end-2025</span> Midpoint
                gold-equivalence case
              </span>
            </button>
            <button
              type="button"
              className="fair-value-scenario"
              data-fair-value-scenario="aggressive"
              aria-pressed="false"
            >
              <strong>Aggressive</strong>
              <span>
                <span className="scenario-cap">$31T · end-2025</span> Total
                above-ground gold
              </span>
            </button>
          </div>
          <p className="proj-method-note" id="projMethodNote">
            <strong>Long-run scenario, not a short-term price target.</strong>{" "}
            The path begins with Bitcoin&apos;s historical power-law regression,
            then progressively slows its excess growth as the modeled market
            cap approaches the selected gold-linked threshold. In the base
            case, at $23T the power-law growth above a 6% long-run nominal rate
            is reduced by half; the path continues converging toward 6% as the
            asset grows.
            The threshold grows 5.2% annually as a modeling assumption based on
            the gold-return estimate, and the calculation holds projected
            Bitcoin supply at 20.8M BTC.
            <code className="proj-formula">
              g<sub>effective</sub> = g<sub>6%</sub> + (g
              <sub>power-law</sub> − g<sub>6%</sub>) × 1 / [1 + (M / K
              <sub>scenario,t</sub>)²]
            </code>
            Here, <strong>M</strong> is the modeled fair-value market cap and K
            <sub>scenario,t</sub> is the selected, annually growing damping
            threshold. The 6% mature-asset rate is informed by gold:
            free-floating gold
            compounded about 8% from 1971–2023, while the{" "}
            <a
              href="https://www.gold.org/goldhub/research/golds-long-term-expected-returns/building-block-approach"
              target="_blank"
              rel="noopener noreferrer"
            >
              World Gold Council&apos;s long-term model
            </a>{" "}
            estimates 5.2% annually for 2025–2040. Bitcoin retains more of its
            historical power-law growth while its market cap is smaller, then
            moves toward a gold-like mature growth rate. “Gap to Fair Value”
            compares each future value with today&apos;s BTC price; it is not a
            forecast return.
          </p>
          <div className="spy-table-scroll">
            <table className="proj-table" id="projTable">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Days Since Genesis</th>
                  <th>Adjusted Fair Value</th>
                  <th>Fair Value Growth</th>
                  <th>Gap to Fair Value</th>
                </tr>
              </thead>
              <tbody id="projBody" />
            </table>
          </div>
        </section>

        <section className="spy-panel risk-lows-wrap" id="historical-lows">
          <div className="spy-section-heading">
            <div>
              <h2>Historical Risk Lows — Accumulation Opportunities</h2>
            </div>
            <p>
              Selected cycle lows with the model reading and subsequent
              one-, two-, and three-year returns.
            </p>
          </div>
          <div className="spy-table-scroll">
            <table className="risk-lows-table" id="riskLowsTable">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Event</th>
                  <th>BTC Close</th>
                  <th>Risk Level</th>
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
                BTC/USD — Price Colored by Risk (Log Scale)
              </h2>
            </div>
            <div className="chart-note">
              Historical risk · projected risk bands + market-cap-adjusted fair
              value through 2040
            </div>
          </div>
          <canvas id="priceCanvas" width="1380" height="540" />
          <Tooltip id="priceTip" valueLabel="Risk" />
          <div className="legend-bar" id="legendBar" />
        </section>

        <section className="spy-panel chart-panel" id="risk-oscillator">
          <div className="chart-header">
            <div>
              <h2 className="chart-label">Risk Oscillator (0 – 1)</h2>
            </div>
            <div className="chart-note">
              Combined = √(Structural × Momentum)
            </div>
          </div>
          <canvas id="riskCanvas" width="1380" height="340" />
          <Tooltip id="riskTip" valueLabel="Risk" showPrice={false} />
        </section>

        <section className="spy-panel chart-panel" id="midterm-cycles">
          <div className="chart-header">
            <div>
              <h2 className="chart-label">
                BTC Year-To-Date ROI — Midterm Election Years
              </h2>
            </div>
            <div className="chart-note">
              Historical paths, range, and average by calendar day
            </div>
          </div>
          <canvas id="midtermCanvas" width="1380" height="480" />
          <Tooltip id="midtermTip" />
          <div id="midtermLegend" />
        </section>

        <div className="update-status" id="updateStatus" />

        <section className="spy-panel methodology" id="methodology">
          <div className="spy-section-heading">
            <div>
              <h2>How combined risk works</h2>
            </div>
            <p>
              Two independent views of Bitcoin&apos;s position, combined to
              balance long-term structure and cycle momentum.
            </p>
          </div>
          <div className="methodology-grid">
            <p>
              <span className="hl">Power-Law Regression:</span>{" "}
              <code>log₁₀(price)</code> vs{" "}
              <code>log₁₀(days since Jan 3 2009)</code>. Readings begin after a
              30-observation warm-up, then use an as-of regression at each date
              to avoid future-price calibration.
            </p>
            <p>
              <span className="hl">Structural Risk:</span> Normalizes the model
              residual against a time-decaying upper envelope fitted from cycle
              peaks, with a continuous 0.005 floor.
            </p>
            <p>
              <span className="hl">Momentum Risk:</span> A four-year rolling
              z-score mapped through a Gaussian CDF, adapting to declining
              volatility.
            </p>
            <p>
              <span className="hl">Combined:</span> Geometric mean √(S × M).
              When either frame indicates low risk, the combined reading is
              pulled lower. Zones are Accumulate 0.00–0.20, Neutral 0.20–0.50,
              Caution 0.50–0.80, and Euphoria 0.80–1.00 everywhere on the site.
            </p>
            <p>
              <span className="hl">Halving Countdown:</span> Uses current block
              height when available and estimates the next 210,000-block epoch
              at ten minutes per block.
            </p>
            <p>
              <span className="hl">Bear Market Progress:</span> Starts from the
              latest all-time high, compares elapsed days with the average
              duration of Bitcoin&apos;s four completed bear markets, and
              estimates a downside range from the model&apos;s lower boundary on
              the average-duration target date to the lowest close since the
              current cycle high.
            </p>
            <p>
              <span className="hl">Coherent Updates:</span> On page load, one
              current quote recalculates every card, table, and chart. Use the
              snapshot refresh control for a new quote; price is never updated
              independently from its dependent metrics.
            </p>
          </div>
        </section>

        <p className="spy-footer">Educational tools only · Not financial advice</p>
      </div>
      <Script src="/btc-risk-engine.js?v=20260821-risk-zone-color" strategy="afterInteractive" />
    </main>
  );
}
