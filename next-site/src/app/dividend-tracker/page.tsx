import type { Metadata } from "next";
import Script from "next/script";
import "./dividend-tracker.css";

const DIVIDEND_ENGINE_VERSION = "20260806-3";

export const metadata: Metadata = {
  title: "Dividend Portfolio Tracker | DaveyBitcoins",
  description:
    "Track dividend holdings, annual income, portfolio yield, upcoming payouts, and multiple locally saved portfolios.",
  alternates: {
    canonical: "/dividend-tracker/",
  },
  openGraph: {
    title: "Dividend Portfolio Tracker — DaveyBitcoins",
    description:
      "Track dividend income, yields, holdings, and upcoming payouts with a monthly calendar.",
    url: "/dividend-tracker/",
    images: ["/social-preview.png"],
  },
};

export default function DividendTrackerPage() {
  return (
    <div className="dividend-page" data-dashboard="dividend-tracker">
      <div className="bg-mesh" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>
      <div className="noise" aria-hidden="true" />

      <div className="sticky-top" id="sticky-top">
        <header>
          <div className="header-content">
            <div className="header-top">
              <div>
                <h1>Dividend Portfolio Tracker</h1>
                <p className="subtitle">
                  Track income, yields &amp; upcoming payouts
                </p>
                <p className="data-date" id="data-date" />
              </div>
            </div>
          </div>
        </header>
      </div>

      <main id="main-content">
        <div className="loading" id="loading">
          Loading dividend data…
        </div>

        <div id="app-content" style={{ display: "none" }}>
          <section className="card" id="holdings-form-card">
            <div className="holdings-header">
              <h2>My Holdings</h2>
              <div className="portfolio-controls" id="portfolio-controls" />
            </div>
            <div className="add-holding-row">
              <div className="ticker-search-wrap" id="ticker-search-wrap">
                <input
                  className="search-input"
                  id="ticker-input"
                  placeholder="Search ticker…"
                  autoComplete="off"
                  aria-label="Search ticker"
                />
                <div className="ticker-dropdown" id="ticker-dropdown" />
              </div>
              <input
                type="number"
                className="holding-input"
                id="shares-input"
                placeholder="Shares"
                min="0.01"
                step="any"
                aria-label="Number of shares"
              />
              <input
                type="number"
                className="holding-input"
                id="cost-input"
                placeholder="$/share"
                min="0"
                step="any"
                aria-label="Cost per share"
              />
              <button type="button" className="btn-add-holding" id="btn-add">
                Add
              </button>
            </div>
          </section>

          <section className="stats-row" id="income-summary">
            <article className="stat-box">
              <div className="value" id="annual-income">
                $0
              </div>
              <div className="label">Annual Income</div>
            </article>
            <article className="stat-box">
              <div className="value" id="monthly-income">
                $0
              </div>
              <div className="label">Monthly Income</div>
            </article>
            <article className="stat-box">
              <div className="value" id="portfolio-yield">
                0.00%
              </div>
              <div className="label">Portfolio Yield</div>
            </article>
            <article className="stat-box">
              <div className="value" id="portfolio-value">
                $0
              </div>
              <div className="label">Portfolio Value</div>
            </article>
          </section>

          <section className="card" id="holdings-table-card">
            <h2>Holdings</h2>
            <div id="holdings-table-wrap" />
          </section>

          <section className="card" id="calendar-card">
            <h2>Upcoming Payouts</h2>
            <div className="calendar-nav">
              <button
                type="button"
                className="btn-cal"
                id="cal-prev"
                aria-label="Previous month"
              >
                ←
              </button>
              <span className="cal-month-label" id="cal-month-label" />
              <button
                type="button"
                className="btn-cal"
                id="cal-next"
                aria-label="Next month"
              >
                →
              </button>
            </div>
            <div id="dividend-calendar" />
          </section>
        </div>
      </main>

      <footer>
        <p>
          Data sourced from TradingView &amp; Finnhub. Portfolio data is stored
          only in this browser. Not financial advice.
        </p>
      </footer>

      <Script
        src={`/dividend-tracker-engine.js?v=${DIVIDEND_ENGINE_VERSION}`}
        strategy="afterInteractive"
      />
    </div>
  );
}
