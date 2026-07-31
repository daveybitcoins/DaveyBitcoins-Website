import type { Metadata } from "next";
import Script from "next/script";
import "./ema-scanner.css";

export const metadata: Metadata = {
  title: "Weekly EMA Strategy Scanner | DaveyBitcoins",
  description:
    "8-week, 13-week, and 21-week EMA signals across the top 300 stocks, paired with BTC, SPY, and QQQ risk context.",
  alternates: {
    canonical: "/ema-scanner/",
  },
  openGraph: {
    title: "Weekly EMA Strategy Scanner — DaveyBitcoins",
    description:
      "Daily trend, pullback, momentum, sector, crossover, and market-risk context for the top 300 stocks.",
    url: "/ema-scanner/",
    images: ["/social-preview.png"],
  },
};

const tabs = [
  ["dashboard", "Dashboard"],
  ["scanner", "Full Scanner"],
  ["pullbacks", "Pullbacks & Entries"],
  ["momentum", "Momentum Leaders"],
  ["bears", "Bear List"],
  ["opportunities", "Best Opportunities"],
  ["outperformers", "Outperformers"],
  ["sectors", "Sector Heatmap"],
  ["crossovers", "Crossover Alerts"],
];

export default function EmaScannerPage() {
  return (
    <div className="ema-page" data-dashboard="ema-scanner">
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
                <h1>Weekly EMA Strategy Scanner</h1>
                <p className="subtitle">
                  8W / 13W / 21W — Top 300 by Market Cap — BTC / SPY / QQQ
                  Risk Context
                </p>
                <p className="data-date" id="data-date" />
              </div>
            </div>
          </div>
        </header>

        <nav className="tab-bar" id="tab-bar" aria-label="Scanner views">
          {tabs.map(([id, label], index) => (
            <button
              type="button"
              className={`tab${index === 0 ? " active" : ""}`}
              data-tab={id}
              key={id}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <main id="main-content">
        <div className="loading" id="loading">
          Loading data…
        </div>

        {tabs.map(([id], index) => (
          <section
            className={`tab-content${index === 0 ? " active" : ""}`}
            id={`tab-${id}`}
            key={id}
          />
        ))}
      </main>

      <footer>
        <p>
          Data sourced from TradingView. Updated daily. Not financial advice.
        </p>
      </footer>

      <Script src="/ema-scanner-engine.js" strategy="afterInteractive" />
    </div>
  );
}
