import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import postcss from "../next-site/node_modules/postcss/lib/postcss.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const publicDirectory = resolve(repositoryRoot, "next-site/public");

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

  writeFileSync(
    resolve(publicDirectory, `${symbol.toLowerCase()}-risk-engine.js`),
    `/* eslint-disable */\n/* Generated from ${sourceFile} by scripts/sync-risk-assets.mjs. */\n${migrated.trim()}\n`,
  );

  copyFileSync(
    resolve(repositoryRoot, dataFile),
    resolve(publicDirectory, dataFile),
  );
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
    `/* eslint-disable */\n/* Generated from ${sourceFile} by scripts/sync-risk-assets.mjs. */\n${migrated.trim()}\n`;

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
  if (trimmed.startsWith('[data-theme="light"]')) {
    return `[data-theme="light"] ${scope}${trimmed.slice(20)}`;
  }
  if (trimmed.startsWith('[data-theme="dark"]')) {
    return `[data-theme="dark"] ${scope}${trimmed.slice(19)}`;
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

  writeFileSync(
    resolve(publicDirectory, "ema-scanner-engine.js"),
    `/* eslint-disable */\n/* Generated from js/app.js by scripts/sync-risk-assets.mjs. */\n${migratedScript.trim()}\n`,
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
    `/* Generated from css/style.css by scripts/sync-risk-assets.mjs. */\n${scopeCss(sourceCss, ".ema-page")}\n.ema-page .sticky-top { top: 76px; z-index: 40; }\n`,
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

  writeFileSync(
    resolve(publicDirectory, "dividend-tracker-engine.js"),
    `/* eslint-disable */\n/* Generated from js/dividends.js by scripts/sync-risk-assets.mjs. */\n${migratedScript.trim()}\n`,
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
  writeFileSync(
    resolve(routeDirectory, "dividend-tracker.css"),
    `/* Generated from css/style.css and css/dividends.css by scripts/sync-risk-assets.mjs. */\n${scopeCss(baseCss, ".dividend-page")}\n${scopeCss(dividendCss, ".dividend-page")}\n.dividend-page .sticky-top { top: 76px; z-index: 40; }\n`,
  );

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

copyFileSync(
  resolve(repositoryRoot, "data_vix.csv"),
  resolve(publicDirectory, "data_vix.csv"),
);
copyFileSync(
  resolve(repositoryRoot, "data_qqq.csv"),
  resolve(publicDirectory, "data_qqq.csv"),
);
