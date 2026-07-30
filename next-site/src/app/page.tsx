const tools = [
  {
    title: "Weekly EMA Scanner",
    description:
      "8W, 13W, and 21W EMA signals across the top 300 stocks, paired with BTC, SPY, and QQQ risk context.",
    status: "Updated daily",
    href: "/ema-scanner/",
    accent: "orange",
    preview: "ema",
    featured: true,
  },
  {
    title: "Bitcoin Risk Metric",
    description:
      "Structural and momentum risk built on power-law regression, with interactive history and forward scenarios.",
    status: "Updated daily",
    href: "/risk-metric/",
    accent: "amber",
    preview: "btc",
    featured: true,
  },
  {
    title: "SPY Risk Metric",
    description:
      "Market-cycle risk from SPY’s 200-week trend deviation, aligned with volatility and valuation scenarios.",
    status: "Updated daily",
    href: "/spy-risk-metric/",
    accent: "blue",
    preview: "spy",
  },
  {
    title: "QQQ Risk Metric",
    description:
      "Nasdaq-100 cycle risk viewed through its long-term trend, volatility, and historical drawdowns.",
    status: "Updated daily",
    href: "/qqq-risk-metric/",
    accent: "violet",
    preview: "qqq",
  },
  {
    title: "Dividend Portfolio Tracker",
    description:
      "Plan dividend income, yields, upcoming payouts, and monthly cash flow using your own holdings.",
    status: "Personal tool",
    href: "/dividend-tracker/",
    accent: "green",
    preview: "dividend",
  },
];

function ToolPreview({ type }: { type: string }) {
  if (type === "ema") {
    return (
      <div className="native-preview native-preview--ema">
        <div className="native-preview__topline">
          <span>Weekly signal matrix</span>
          <span className="native-preview__live">Live</span>
        </div>
        <div className="ema-preview__head" aria-hidden="true">
          <span>Asset</span>
          <span>8W</span>
          <span>13W</span>
          <span>21W</span>
          <span>Signal</span>
        </div>
        <div className="ema-preview__rows" aria-hidden="true">
          {[
            ["SPY", "+0.4%", "+0.9%", "+2.3%", "Bull"],
            ["QQQ", "−2.9%", "−2.4%", "−0.5%", "Watch"],
            ["BTC", "−1.8%", "−4.3%", "−8.5%", "Bear"],
          ].map(([symbol, ema8, ema13, ema21, signal]) => (
            <div className="ema-preview__row" key={symbol}>
              <strong>{symbol}</strong>
              <span>{ema8}</span>
              <span>{ema13}</span>
              <span>{ema21}</span>
              <em data-signal={signal.toLowerCase()}>{signal}</em>
            </div>
          ))}
        </div>
        <div className="ema-preview__breadth">
          <span>Market breadth</span>
          <div aria-hidden="true">
            <span style={{ width: "66%" }} />
          </div>
          <strong>66%</strong>
        </div>
      </div>
    );
  }

  if (type === "btc") {
    return (
      <div className="native-preview native-preview--btc">
        <div className="native-preview__topline">
          <span>BTC / Cycle risk</span>
          <span>Combined model</span>
        </div>
        <div className="btc-preview__reading">
          <div>
            <span>Current risk</span>
            <strong>0.12</strong>
          </div>
          <em>Accumulate</em>
        </div>
        <div className="btc-preview__scale" aria-hidden="true">
          <span />
        </div>
        <div className="btc-preview__chart" aria-hidden="true">
          {[24, 29, 27, 38, 35, 48, 45, 60, 56, 72, 66, 84].map(
            (height, index) => (
              <span key={index} style={{ height: `${height}%` }} />
            ),
          )}
        </div>
        <div className="btc-preview__axis">
          <span>Long-term trend</span>
          <span>Today</span>
        </div>
      </div>
    );
  }

  const previewDetails: Record<
    string,
    { symbol: string; label: string; bars: number[] }
  > = {
    spy: {
      symbol: "SPY",
      label: "200-week cycle",
      bars: [28, 38, 34, 55, 49, 68, 62, 82],
    },
    qqq: {
      symbol: "QQQ",
      label: "Nasdaq-100 cycle",
      bars: [24, 31, 45, 39, 58, 73, 66, 88],
    },
    dividend: {
      symbol: "$",
      label: "Projected income",
      bars: [34, 48, 42, 62, 57, 72, 68, 86],
    },
  };
  const detail = previewDetails[type];

  return (
    <div className="metric-preview">
      <div className="metric-preview__topline">
        <span>{detail.symbol}</span>
        <span>{detail.label}</span>
      </div>
      <div className="metric-preview__chart" aria-hidden="true">
        {detail.bars.map((height, index) => (
          <span key={index} style={{ height: `${height}%` }} />
        ))}
      </div>
      <div className="metric-preview__axis">
        <span>Low</span>
        <span>Current view</span>
        <span>High</span>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main>
      <section className="hero-shell">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">
              <span>Independent market tools</span>
              <span className="eyebrow-dot" />
              Updated daily
            </p>
            <h1>
              See through the noise.
              <br />
              <span>Build wealth with conviction.</span>
            </h1>
            <p className="hero-lede">
              Risk metrics and investing dashboards built to turn noisy markets
              into a clearer long-term view.
            </p>
            <div className="hero-actions">
              <a className="primary-button" href="#tools">
                Explore the tools
                <span aria-hidden="true">↓</span>
              </a>
              <span className="hero-note">No login required</span>
            </div>
          </div>

          <div className="signal-panel" aria-label="Animated 3D Bitcoin orbit">
            <div className="signal-grid" aria-hidden="true" />
            <div className="signal-scene" aria-hidden="true">
              <div className="signal-orbit signal-orbit--outer">
                <span className="signal-orbit__node" />
              </div>
              <div className="signal-orbit signal-orbit--middle">
                <span className="signal-orbit__node" />
              </div>
              <div className="signal-orbit signal-orbit--inner">
                <span className="signal-orbit__node" />
              </div>

              <div className="signal-coin">
                {[-8, -4, 0, 4, 8].map((depth) => (
                  <span
                    className="signal-coin__edge"
                    style={{ transform: `translateZ(${depth}px)` }}
                    key={depth}
                  />
                ))}
                <span className="signal-coin__face signal-coin__face--front">
                  ₿
                </span>
                <span className="signal-coin__face signal-coin__face--back">
                  ₿
                </span>
              </div>

              <span className="signal-shadow" />
            </div>
            <span className="signal-panel__label signal-panel__label--top">
              Market signal / live
            </span>
            <span className="signal-panel__label signal-panel__label--bottom">
              03 axes · 360° cycle
            </span>
          </div>
        </div>
      </section>

      <section id="tools" className="tools-shell">
        <div className="section-heading">
          <div>
            <h2>Know the market. Own the plan.</h2>
          </div>
          <p>
            Explore market structure, trend strength, and portfolio cash flow
            without losing the long-term context.
          </p>
        </div>

        <div className="tool-grid">
          {tools.map((tool, index) => (
            <a
              key={tool.title}
              href={tool.href}
              className={`tool-card tool-card--${tool.accent} ${
                tool.featured ? "tool-card--featured" : ""
              }`}
              aria-label={`Open ${tool.title}`}
            >
              <div className="tool-preview">
                <ToolPreview type={tool.preview} />
                <span className="tool-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="tool-card__body">
                <div className="tool-status">
                  <span />
                  {tool.status}
                </div>
                <h3>{tool.title}</h3>
                <p>{tool.description}</p>
                <span className="tool-link">
                  Open dashboard <span aria-hidden="true">↗</span>
                </span>
              </div>
            </a>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <p>© {new Date().getFullYear()} DaveyBitcoins</p>
        <p>Educational tools only · Not financial advice</p>
      </footer>
    </main>
  );
}
