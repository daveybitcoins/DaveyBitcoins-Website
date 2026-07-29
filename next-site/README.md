# DaveyBitcoins Next.js migration

This directory contains the new DaveyBitcoins application while the existing
HTML website continues to run from the repository root.

## Local development

```bash
cd next-site
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production-style check

```bash
npm run build
npm run preview
```

The build is emitted to `out/` as static files.

## Production deployment

Hostinger serves the repository root from the `main` branch. After a successful
build, sync `out/` into the repository root, preserve the legacy redirects in
`.htaccess`, and commit the generated root files with the Next.js source.

## Migration sequence

1. Establish this isolated foundation.
2. Rebuild the homepage and shared site shell.
3. Port one dashboard and compare its output with the current page. (SPY complete)
4. Port the remaining dashboards. (QQQ, BTC, EMA, and dividend tracker complete)
5. Run compatibility and smoke checks before changing production. (complete)
6. Publish the static export through the existing Hostinger deployment. (complete)
