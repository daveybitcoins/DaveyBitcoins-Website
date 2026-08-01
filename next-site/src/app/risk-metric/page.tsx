import type { Metadata } from "next";
import Script from "next/script";

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
          {valueLabel}: <span className="tt-risk" />
        </div>
      )}
    </div>
  );
}

const movingAverages = [300, 200, 50, 21, 13, 8];

export default function BitcoinRiskMetricPage() {
  return (
    <main className="spy-page btc-page" data-risk-dashboard="btc">
      <div className="spy-container">
        <header className="spy-intro">
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
        </header>

        <section className="dashboard" aria-label="Bitcoin market summary">
          <article className="card card-price">
            <div className="card-label">BTC Price</div>
            <div className="card-value card-value--price" id="vPrice">
              —
            </div>
            <div className="card-sub" id="vPriceTime" />
          </article>
          <article className="card">
            <div className="card-label">Combined Risk</div>
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

        <section className="spy-panel risk-table-wrap">
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

        <section className="spy-panel proj-table-wrap">
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
              Current Supply: <span id="currentSupply">—</span>
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

        <section className="spy-panel proj-table-wrap">
          <div className="spy-section-heading">
            <div>
              <h2>Bitcoin Market-Cap-Adjusted Power-Law Fair Value</h2>
            </div>
            <p>
              A maturity-adjusted long-run scenario extending Bitcoin&apos;s
              historical power-law path through 2040.
            </p>
          </div>
          <p className="proj-method-note" id="projMethodNote">
            <strong>Long-run scenario, not a short-term price target.</strong>{" "}
            The path begins with Bitcoin&apos;s historical power-law regression,
            then progressively slows its excess growth as the modeled market
            cap approaches $20T. At $20T, the power-law growth above a 6%
            long-run nominal rate is reduced by half; the path continues
            converging toward 6% as the asset grows. The calculation assumes
            20.8M BTC.
            <code className="proj-formula">
              g<sub>effective</sub> = g<sub>6%</sub> + (g
              <sub>power-law</sub> − g<sub>6%</sub>) × 1 / [1 + (M / $20T)²]
            </code>
            Here, <strong>M</strong> is the modeled fair-value market cap. The
            6% mature-asset rate is informed by gold: free-floating gold
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

        <section className="spy-panel risk-lows-wrap">
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

        <section className="spy-panel chart-panel">
          <div className="chart-header">
            <div>
              <h2 className="chart-label">
                BTC/USD — Price Colored by Risk (Log Scale)
              </h2>
            </div>
            <div className="chart-note">
              Historical risk · market-cap-adjusted fair value through 2040
            </div>
          </div>
          <canvas id="priceCanvas" width="1380" height="540" />
          <Tooltip id="priceTip" valueLabel="Risk" />
          <div className="legend-bar" id="legendBar" />
        </section>

        <section className="spy-panel chart-panel">
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

        <section className="spy-panel chart-panel">
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

        <section className="spy-panel methodology">
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
              <code>log₁₀(days since Jan 3 2009)</code>. Historical risk uses an
              as-of regression at each date to avoid future-price calibration.
            </p>
            <p>
              <span className="hl">Structural Risk:</span> Normalizes the model
              residual against a time-decaying upper envelope fitted from cycle
              peaks.
            </p>
            <p>
              <span className="hl">Momentum Risk:</span> A four-year rolling
              z-score mapped through a Gaussian CDF, adapting to declining
              volatility.
            </p>
            <p>
              <span className="hl">Combined:</span> Geometric mean √(S × M).
              When either frame indicates low risk, the combined reading is
              pulled lower.
            </p>
            <p>
              <span className="hl">Halving Countdown:</span> Uses current block
              height when available and estimates the next 210,000-block epoch
              at ten minutes per block.
            </p>
            <p>
              <span className="hl">Bear Market Progress:</span> Compares time
              since the latest all-time high with completed Bitcoin bear
              markets and a model-derived downside range.
            </p>
          </div>
        </section>

        <p className="spy-footer">Educational tools only · Not financial advice</p>
      </div>
      <Script src="/btc-risk-engine.js?v=20260801-daily-forecast" strategy="afterInteractive" />
    </main>
  );
}
