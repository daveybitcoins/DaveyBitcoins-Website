#!/bin/bash
# Wrapper script for launchd to run fetch_ema.py
cd /Users/davemac/Projects/DaveyBitcoins-Website
export PYTHONPATH="/Users/davemac/Library/Python/3.9/lib/python/site-packages"
/usr/bin/python3 scripts/fetch_ema.py --process
