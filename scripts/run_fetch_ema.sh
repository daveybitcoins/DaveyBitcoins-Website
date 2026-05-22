#!/bin/bash
# Wrapper script for launchd to run fetch_ema.py + generate OpenAI summary
cd /Users/davemac/Projects/DaveyBitcoins-Website
export PYTHONPATH="/Users/davemac/Library/Python/3.9/lib/python/site-packages"

# Load API key from env file if it exists
if [ -f scripts/.env ]; then
    export $(grep -v '^#' scripts/.env | xargs)
fi

/usr/bin/python3 scripts/fetch_ema.py --process
/usr/bin/python3 scripts/generate_summary.py

# Bust browser cache for JS/CSS by updating version stamp in HTML
STAMP=$(date +%Y%m%d%H%M)
sed -i '' "s/app\.js?v=[0-9]*/app.js?v=${STAMP}/" ema-scanner.html
sed -i '' "s/style\.css?v=[0-9]*/style.css?v=${STAMP}/" ema-scanner.html
