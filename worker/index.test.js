import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import worker from './index.js';

let originalFetch;
let originalCaches;
let cacheEntries;
let pendingTasks;

function createContext() {
  return {
    waitUntil(promise) {
      pendingTasks.push(promise);
    },
  };
}

function createLimiter(results = []) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async limit() {
      const success = results[calls] ?? true;
      calls += 1;
      return { success };
    },
  };
}

function createEnv(limiter = createLimiter()) {
  return {
    FINNHUB_KEY: 'test-key',
    QUOTE_RATE_LIMITER: limiter,
    DIVIDEND_RATE_LIMITER: createLimiter(),
  };
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalCaches = globalThis.caches;
  cacheEntries = new Map();
  pendingTasks = [];
  globalThis.caches = {
    default: {
      async match(request) {
        const response = cacheEntries.get(request.url);
        return response?.clone();
      },
      async put(request, response) {
        cacheEntries.set(request.url, response.clone());
      },
    },
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.caches = originalCaches;
});

test('single quotes are cached at the edge', async () => {
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return Response.json({ c: 123.45 });
  };
  const env = createEnv();

  const first = await worker.fetch(
    new Request('https://worker.example/api/quote?symbol=AAPL'),
    env,
    createContext()
  );
  await Promise.all(pendingTasks);
  pendingTasks = [];
  const second = await worker.fetch(
    new Request('https://worker.example/api/quote?symbol=AAPL'),
    env,
    createContext()
  );

  assert.equal(first.status, 200);
  assert.equal(first.headers.get('X-Quote-Cache'), 'MISS');
  assert.equal(second.headers.get('X-Quote-Cache'), 'HIT');
  assert.equal(upstreamCalls, 1);
});

test('batch quotes are deduplicated and charged per unique symbol', async () => {
  let upstreamCalls = 0;
  globalThis.fetch = async (url) => {
    upstreamCalls += 1;
    const symbol = new URL(url).searchParams.get('symbol');
    return Response.json({ c: symbol === 'AAPL' ? 100 : 200 });
  };
  const limiter = createLimiter();
  const response = await worker.fetch(
    new Request('https://worker.example/api/quotes?symbols=AAPL,AAPL,MSFT'),
    createEnv(limiter),
    createContext()
  );
  const data = await response.json();

  assert.deepEqual(Object.keys(data), ['AAPL', 'MSFT']);
  assert.equal(upstreamCalls, 2);
  assert.equal(limiter.calls, 2);
});

test('rate-limited quote requests return 429 without calling upstream', async () => {
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return Response.json({ c: 123.45 });
  };
  const response = await worker.fetch(
    new Request('https://worker.example/api/quote?symbol=AAPL'),
    createEnv(createLimiter([false])),
    createContext()
  );

  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.equal(upstreamCalls, 0);
});

test('rate-limited dividend requests return 429 without calling upstream', async () => {
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return Response.json({ results: [] });
  };
  const env = createEnv();
  env.DIVIDEND_RATE_LIMITER = createLimiter([false]);
  const response = await worker.fetch(
    new Request('https://worker.example/api/dividends/AAPL'),
    env,
    createContext()
  );

  assert.equal(response.status, 429);
  assert.equal(upstreamCalls, 0);
});

test('non-GET API requests are rejected', async () => {
  const response = await worker.fetch(
    new Request('https://worker.example/api/quote?symbol=AAPL', {
      method: 'POST',
    }),
    createEnv(),
    createContext()
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET, OPTIONS');
});
