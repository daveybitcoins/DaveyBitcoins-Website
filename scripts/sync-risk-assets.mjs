import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import postcss from "../next-site/node_modules/postcss/lib/postcss.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const publicDirectory = resolve(repositoryRoot, "next-site/public");
const chartReaderSource = readFileSync(resolve(repositoryRoot, "js/chart-access.js"), "utf8");

rmSync(resolve(publicDirectory, "qqq-risk-engine.js"), { force: true });

function syncDashboard({ symbol, sourceFile, dataFile }) {
  const source = readFileSync(resolve(repositoryRoot, sourceFile), "utf8");
  const matches = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const engine = matches.at(-1)?.[1];

  if (!engine || !engine.includes("async function main()")) {
    throw new Error(`Could not locate the ${symbol} dashboard engine.`);
  }

  const migrated = engine
    .replaceAll(`'${dataFile}?v='+bust`, `'/${dataFile}?v='+bust`)
    .replaceAll("'data_vix.csv?v='+bust", "'/data_vix.csv?v='+bust")
    .replaceAll(
      "'data/spy_valuation.json?v='+bust",
      "'/data/spy_valuation.json?v='+bust",
    )
    .replaceAll(
      "window.addEventListener('mousemove', e => {",
      `window.addEventListener('mousemove', e => {
      if (!document.querySelector('[data-risk-dashboard="${symbol.toLowerCase()}"]')) return;`,
    )
    .replaceAll(
      "cv.addEventListener('mousemove', e => {",
      `cv.addEventListener('mousemove', e => {
      if (!document.querySelector('[data-risk-dashboard="${symbol.toLowerCase()}"]')) return;`,
    )
    .replaceAll(
      "cv.addEventListener('mousemove', function(e){",
      `cv.addEventListener('mousemove', function(e){
        if (!document.querySelector('[data-risk-dashboard="${symbol.toLowerCase()}"]')) return;`,
    )
    .replace(
      /  \/\/ Theme toggle\n  \(function\(\)\{\n    if \(!window\.DaveyTheme\) return;\n    window\.DaveyTheme\.init\(\{ onChange: function\(\) \{\n      renderAll\(\);if\(window\._dcaRerender\)window\._dcaRerender\(\);\n    \}\}\);\n  \}\)\(\);/,
      `  // Repaint canvas charts when the shared Next.js theme changes.
  window.addEventListener('davey-theme-change', function() {
    if (!document.querySelector('[data-risk-dashboard="${symbol.toLowerCase()}"]')) return;
    renderAll();
    if (window._dcaRerender) window._dcaRerender();
  });`,
    );

  const generatedEngine =
    `/* eslint-disable */\n/* Generated from ${sourceFile} by scripts/sync-risk-assets.mjs. */\n${chartReaderSource}\n${migrated.trim()}\n`;
  writeFileSync(
    resolve(publicDirectory, `${symbol.toLowerCase()}-risk-engine.js`),
    generatedEngine,
  );
  writeFileSync(
    resolve(repositoryRoot, `${symbol.toLowerCase()}-risk-engine.js`),
    generatedEngine,
  );

  copyFileSync(
    resolve(repositoryRoot, dataFile),
    resolve(publicDirectory, dataFile),
  );

  if (symbol === "SPY") {
    const dataDirectory = resolve(publicDirectory, "data");
    mkdirSync(dataDirectory, { recursive: true });
    copyFileSync(
      resolve(repositoryRoot, "data/spy_valuation.json"),
      resolve(dataDirectory, "spy_valuation.json"),
    );
  }
}

function syncBitcoinDashboard() {
  const sourceFile = "risk-metric.html";
  const source = readFileSync(resolve(repositoryRoot, sourceFile), "utf8");
  const matches = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const engine = matches.at(-1)?.[1];

  if (!engine || !engine.includes("async function main()")) {
    throw new Error("Could not locate the BTC dashboard engine.");
  }

  const migrated = engine
    .replace(
      "fetch('data.csv?v=' + Date.now())",
      "fetch('/data.csv?v=' + Date.now())",
    )
    .replaceAll(
      "window.addEventListener('mousemove', e => {",
      `window.addEventListener('mousemove', e => {
      if (!document.querySelector('[data-risk-dashboard="btc"]')) return;`,
    )
    .replaceAll(
      "cv.addEventListener('mousemove', e => {",
      `cv.addEventListener('mousemove', e => {
      if (!document.querySelector('[data-risk-dashboard="btc"]')) return;`,
    )
    .replaceAll(
      "cv.addEventListener('mousemove', function(e) {",
      `cv.addEventListener('mousemove', function(e) {
      if (!document.querySelector('[data-risk-dashboard="btc"]')) return;`,
    )
    .replace(
      /  \/\/ ====== THEME TOGGLE ======\n  \(function\(\)\{\n    if \(!window\.DaveyTheme\) return;\n    window\.DaveyTheme\.init\(\{ onChange: function\(\) \{\n      renderAll\(\);\n    \}\}\);\n  \}\)\(\);/,
      `  // Repaint canvas charts when the shared Next.js theme changes.
  window.addEventListener('davey-theme-change', function() {
    if (!document.querySelector('[data-risk-dashboard="btc"]')) return;
    renderAll();
  });`,
    );

  const generatedEngine =
    `/* eslint-disable */\n/* Generated from ${sourceFile} by scripts/sync-risk-assets.mjs. */\n${chartReaderSource}\n${migrated.trim()}\n`;

  writeFileSync(
    resolve(publicDirectory, "btc-risk-engine.js"),
    generatedEngine,
  );
  writeFileSync(
    resolve(repositoryRoot, "btc-risk-engine.js"),
    generatedEngine,
  );

  copyFileSync(
    resolve(repositoryRoot, "data.csv"),
    resolve(publicDirectory, "data.csv"),
  );
}

function scopeSelector(selector, scope) {
  const trimmed = selector.trim();

  if (trimmed === ":root") return scope;
  if (trimmed.startsWith(":root ")) {
    return `${scope}${trimmed.slice(5)}`;
  }
  const themed = trimmed.match(/^(\[data-theme="(?:light|dark)"\])(.*)$/);
  if (themed) {
    const rest = themed[2].trim();
    return `${themed[1]} ${rest ? scopeSelector(rest, scope) : scope}`;
  }
  if (trimmed === "html" || trimmed === "body") return scope;
  if (trimmed.startsWith("html ")) {
    return `${scope}${trimmed.slice(4)}`;
  }
  if (trimmed.startsWith("body ")) {
    return `${scope}${trimmed.slice(4)}`;
  }

  return `${scope} ${trimmed}`;
}

function scopeCss(sourceCss, scope) {
  const cssRoot = postcss.parse(sourceCss);
  cssRoot.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) {
      return;
    }
    rule.selector = rule.selectors
      .map((selector) => scopeSelector(selector, scope))
      .join(", ");
  });
  return cssRoot.toString();
}

function syncEmaScanner() {
  const sourceScript = readFileSync(
    resolve(repositoryRoot, "js/app.js"),
    "utf8",
  );
  const migratedScript = sourceScript
    .replaceAll(
      '"data/scanner_data.json?v="',
      '"/data/scanner_data.json?v="',
    )
    .replaceAll("fetch('data.csv?v='", "fetch('/data.csv?v='")
    .replaceAll("'data_spy.csv'", "'/data_spy.csv'")
    .replaceAll("'data_qqq.csv'", "'/data_qqq.csv'")
    .replaceAll("spy-risk-metric.html", "/spy-risk-metric/")
    .replaceAll("risk-metric.html", "/risk-metric/")
    .replace(
      '    document.addEventListener("DOMContentLoaded", init);',
      `    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }`,
    );

  const generatedEngine =
    `/* eslint-disable */\n/* Generated from js/app.js by scripts/sync-risk-assets.mjs. */\n${migratedScript.trim()}\n`;
  writeFileSync(
    resolve(publicDirectory, "ema-scanner-engine.js"),
    generatedEngine,
  );
  writeFileSync(
    resolve(repositoryRoot, "ema-scanner-engine.js"),
    generatedEngine,
  );

  const sourceCss = readFileSync(
    resolve(repositoryRoot, "css/style.css"),
    "utf8",
  );
  const routeDirectory = resolve(
    repositoryRoot,
    "next-site/src/app/ema-scanner",
  );
  mkdirSync(routeDirectory, { recursive: true });
  writeFileSync(
    resolve(routeDirectory, "ema-scanner.css"),
    `/* Generated from css/style.css by scripts/sync-risk-assets.mjs. */\n${scopeCss(sourceCss, ".ema-page")}\n.ema-page .sticky-top { top: 76px; z-index: 40; }\n@media (max-width: 620px) { .ema-page .sticky-top { top: 68px; } }\n`,
  );

  const dataDirectory = resolve(publicDirectory, "data");
  mkdirSync(dataDirectory, { recursive: true });
  copyFileSync(
    resolve(repositoryRoot, "data/scanner_data.json"),
    resolve(dataDirectory, "scanner_data.json"),
  );
}

function syncDividendTracker() {
  const sourceScript = readFileSync(
    resolve(repositoryRoot, "js/dividends.js"),
    "utf8",
  );
  const migratedScript = sourceScript
    .replaceAll('"data/dividend_data.json"', '"/data/dividend_data.json"')
    .replaceAll(
      '"data/dividend_data.json?v="',
      '"/data/dividend_data.json?v="',
    )
    .replace(
      "        if (document.visibilityState === 'hidden') return;",
      `        if (!document.querySelector('.dividend-page')) return;
        if (document.visibilityState === 'hidden') return;`,
    )
    .replace(
      '    document.addEventListener("DOMContentLoaded", init);',
      `    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }`,
    );

  const generatedEngine =
    `/* eslint-disable */\n/* Generated from js/dividends.js by scripts/sync-risk-assets.mjs. */\n${migratedScript.trim()}\n`;
  writeFileSync(
    resolve(publicDirectory, "dividend-tracker-engine.js"),
    generatedEngine,
  );
  writeFileSync(
    resolve(repositoryRoot, "dividend-tracker-engine.js"),
    generatedEngine,
  );

  const baseCss = readFileSync(
    resolve(repositoryRoot, "css/style.css"),
    "utf8",
  );
  const dividendCss = readFileSync(
    resolve(repositoryRoot, "css/dividends.css"),
    "utf8",
  );
  const routeDirectory = resolve(
    repositoryRoot,
    "next-site/src/app/dividend-tracker",
  );
  mkdirSync(routeDirectory, { recursive: true });
  const generatedCss =
    `/* Generated from css/style.css and css/dividends.css by scripts/sync-risk-assets.mjs. */\n${scopeCss(baseCss, ".dividend-page")}\n${scopeCss(dividendCss, ".dividend-page")}\n.dividend-page .sticky-top { top: 76px; z-index: 40; }\n@media (max-width: 620px) { .dividend-page .sticky-top { top: 68px; } }\n`;
  writeFileSync(
    resolve(routeDirectory, "dividend-tracker.css"),
    generatedCss,
  );
  writeFileSync(resolve(publicDirectory, "dividend-tracker.css"), generatedCss);
  writeFileSync(resolve(repositoryRoot, "dividend-tracker.css"), generatedCss);

  const dataDirectory = resolve(publicDirectory, "data");
  mkdirSync(dataDirectory, { recursive: true });
  copyFileSync(
    resolve(repositoryRoot, "data/dividend_data.json"),
    resolve(dataDirectory, "dividend_data.json"),
  );
}

syncDashboard({
  symbol: "SPY",
  sourceFile: "spy-risk-metric.html",
  dataFile: "data_spy.csv",
});

syncBitcoinDashboard();
syncEmaScanner();
syncDividendTracker();

// Reuse the dashboard calculations on the homepage without loading a dashboard
// engine (and its DOM side effects). Fail the build if the source shape changes.
function extractModelFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing model function: ${name}`);
  const body = source.indexOf("{", start);
  let depth = 0;
  for (let i = body; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed model function: ${name}`);
}
const btcSource = readFileSync(resolve(repositoryRoot, "btc-risk-engine.js"), "utf8");
const spySource = readFileSync(resolve(repositoryRoot, "spy-risk-engine.js"), "utf8");
const btcConstants = btcSource.match(/const GENESIS =[^]*?const FAIR_VALUE_PROJECTION_END_MS = Date\.UTC\(2040, 11, 1\);/);
if (!btcConstants) throw new Error("Missing BTC model constants");
const modelDirectory = resolve(repositoryRoot, "next-site/src/lib");
mkdirSync(modelDirectory, { recursive: true });
// Version the SPY script by content so cached scripts cannot restore old labels.
const spyEngineVersion = createHash("sha256").update(spySource).digest("hex").slice(0, 16);
writeFileSync(resolve(modelDirectory, "spy-risk-asset.ts"),
  `// Generated by scripts/sync-risk-assets.mjs.
export const spyRiskEngineSrc = "/spy-risk-engine.js?v=${spyEngineVersion}";
`);

const scannerEngineVersion = createHash("sha256")
  .update(readFileSync(resolve(publicDirectory, "ema-scanner-engine.js")))
  .digest("hex").slice(0, 16);
writeFileSync(resolve(modelDirectory, "scanner-asset.ts"),
  `// Generated by scripts/sync-risk-assets.mjs.
export const scannerEngineSrc = "/ema-scanner-engine.js?v=${scannerEngineVersion}";
`);

writeFileSync(resolve(modelDirectory, "market-models.js"), `/* eslint-disable */
// Generated by scripts/sync-risk-assets.mjs from the dashboard models.
export const bitcoinSnapshot = (() => {
${btcConstants[0]}
${["buildDataset", "normCdf", "structuralRiskForResidual"].map(name => extractModelFunction(btcSource, name)).join("\n")}
return raw => {
  if (raw.length < MIN_REGRESSION_OBSERVATIONS) throw new Error("Insufficient Bitcoin history");
  const { pts } = buildDataset(raw);
  const point = pts[pts.length - 1];
  return { date: point.date, price: point.price, risk: point.riskCombo };
};
})();
export const spySnapshot = (() => {
${["upperBound", "assignTrailingPercentiles", "buildDataset"].map(name => extractModelFunction(spySource, name)).join("\n")}
return raw => {
  const { pts } = buildDataset(raw, {});
  const point = pts[pts.length - 1];
  if (!point || point.modelWarmup || !Number.isFinite(point.riskCombo)) throw new Error("Insufficient SPY history");
  return { date: point.date, price: point.price, risk: point.riskCombo };
};
})();
`);

copyFileSync(
  resolve(repositoryRoot, "data_vix.csv"),
  resolve(publicDirectory, "data_vix.csv"),
);
copyFileSync(
  resolve(repositoryRoot, "data_qqq.csv"),
  resolve(publicDirectory, "data_qqq.csv"),
);
