'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { RpcError, backoffDelay, createRpcClient, parseRetryAfter } = require('../src/rpc');
const { createMockFetch, http, ok, rpcFail } = require('./helpers/mock-rpc');

const URL_WITH_KEY = 'https://rpc.example.com/?api-key=secret123';

function setup(steps, extra = {}) {
  const fetch = createMockFetch(steps);
  const sleeps = [];
  const retries = [];
  const rpc = createRpcClient({
    url: URL_WITH_KEY,
    fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
    onRetry: (info) => retries.push(info),
    ...extra,
  });
  return { rpc, fetch, sleeps, retries };
}

async function failure(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return assert.fail('expected the call to reject');
}

test('returns the result and sends a proper JSON-RPC request', async () => {
  const { rpc, fetch } = setup([ok({ value: null })]);

  const result = await rpc.call('getAccountInfo', ['abc', { encoding: 'jsonParsed' }]);

  assert.deepEqual(result, { value: null });
  assert.equal(fetch.calls.length, 1);
  const call = fetch.calls[0];
  assert.equal(call.url, URL_WITH_KEY);
  assert.equal(call.init.method, 'POST');
  assert.equal(call.request.jsonrpc, '2.0');
  assert.equal(call.request.method, 'getAccountInfo');
  assert.deepEqual(call.request.params, ['abc', { encoding: 'jsonParsed' }]);
});

test('params default to an empty list', async () => {
  const { rpc, fetch } = setup([ok(1)]);
  await rpc.call('getVersion');
  assert.deepEqual(fetch.calls[0].request.params, []);
});

test('a 429 is retried after a backoff and then succeeds', async () => {
  const { rpc, sleeps, retries } = setup([http(429), ok('hello')]);

  assert.equal(await rpc.call('getVersion'), 'hello');

  assert.deepEqual(sleeps, [500]);
  assert.equal(retries.length, 1);
  assert.equal(retries[0].attempt, 1);
  assert.equal(retries[0].delayMs, 500);
  assert.equal(retries[0].error.kind, 'rate-limited');
});

test('a Retry-After header is respected', async () => {
  const { rpc, sleeps } = setup([http(429, { headers: { 'Retry-After': '2' } }), ok(1)]);
  await rpc.call('getVersion');
  assert.deepEqual(sleeps, [2000]);
});

test('a huge Retry-After is capped at maxDelayMs', async () => {
  const { rpc, sleeps } = setup([http(429, { headers: { 'retry-after': '120' } }), ok(1)]);
  await rpc.call('getVersion');
  assert.deepEqual(sleeps, [8000]);
});

test('gives up after the allowed attempts on a steady 429', async () => {
  const { rpc, fetch, retries } = setup([http(429)], { attempts: 3 });

  const error = await failure(rpc.call('getVersion'));

  assert.ok(error instanceof RpcError);
  assert.equal(error.kind, 'rate-limited');
  assert.equal(error.rateLimited, true);
  assert.match(error.message, /rate limiting/);
  assert.equal(fetch.calls.length, 3);
  assert.equal(retries.length, 2);
});

test('401 and 403 stop at once and mention the API key', async () => {
  for (const status of [401, 403]) {
    const { rpc, fetch, sleeps } = setup([http(status)]);

    const error = await failure(rpc.call('getVersion'));

    assert.equal(error.kind, 'auth');
    assert.equal(error.retryable, false);
    assert.match(error.message, new RegExp(`HTTP ${status}`));
    assert.match(error.message, /API key/);
    assert.equal(fetch.calls.length, 1);
    assert.equal(sleeps.length, 0);
  }
});

test('404 stops at once and says to check the URL', async () => {
  const { rpc, fetch } = setup([http(404)]);

  const error = await failure(rpc.call('getVersion'));

  assert.equal(error.kind, 'not-found');
  assert.match(error.message, /check the URL/);
  assert.equal(fetch.calls.length, 1);
});

test('a 503 is retried', async () => {
  const { rpc, fetch } = setup([http(503), ok('up')]);
  assert.equal(await rpc.call('getVersion'), 'up');
  assert.equal(fetch.calls.length, 2);
});

test('other HTTP statuses are not retried', async () => {
  const { rpc, fetch } = setup([http(400)]);

  const error = await failure(rpc.call('getVersion'));

  assert.equal(error.kind, 'bad-response');
  assert.match(error.message, /HTTP 400/);
  assert.equal(fetch.calls.length, 1);
});

test('a network error is retried and then reported in plain English', async () => {
  const failing = Object.assign(new TypeError(`fetch failed ${URL_WITH_KEY}`), {
    cause: { code: 'ENOTFOUND' },
  });
  const { rpc, fetch } = setup([{ error: failing }], { attempts: 2 });

  const error = await failure(rpc.call('getVersion'));

  assert.equal(error.kind, 'network');
  assert.match(error.message, /DNS/);
  assert.equal(fetch.calls.length, 2);
});

test('a request that never answers times out', async () => {
  const { rpc } = setup([{ hang: true }], { attempts: 1, timeoutMs: 10 });

  const error = await failure(rpc.call('getVersion'));

  assert.equal(error.kind, 'timeout');
  assert.match(error.message, /did not answer in time/);
});

test('a JSON-RPC error is not retried and keeps its message', async () => {
  const { rpc, fetch } = setup([rpcFail(-32602, 'Invalid param: bad address')]);

  const error = await failure(rpc.call('getAccountInfo', ['x']));

  assert.equal(error.kind, 'rpc');
  assert.match(error.message, /Invalid param: bad address/);
  assert.equal(fetch.calls.length, 1);
});

test('a JSON-RPC rate-limit error is retried', async () => {
  const { rpc, retries } = setup([rpcFail(429, 'Too many requests'), ok('x')]);

  assert.equal(await rpc.call('getVersion'), 'x');
  assert.equal(retries[0].error.kind, 'rate-limited');
});

test('a body that is not JSON is a bad response, not retried', async () => {
  const { rpc, fetch } = setup([{ text: '<html>oops</html>' }]);

  const error = await failure(rpc.call('getVersion'));

  assert.equal(error.kind, 'bad-response');
  assert.match(error.message, /did not return JSON/);
  assert.equal(fetch.calls.length, 1);
});

test('no error message ever contains the endpoint URL or key', async () => {
  const stepsList = [
    [http(429)],
    [http(401)],
    [http(404)],
    [http(503)],
    [http(400)],
    [{ error: Object.assign(new TypeError(`fetch failed ${URL_WITH_KEY}`), { cause: { code: 'ECONNREFUSED' } }) }],
    [{ error: new Error(URL_WITH_KEY) }],
    [{ text: URL_WITH_KEY }],
  ];

  for (const steps of stepsList) {
    const { rpc } = setup(steps, { attempts: 1 });
    const error = await failure(rpc.call('getVersion'));
    assert.equal(error.message.includes('secret123'), false, error.message);
    assert.equal(error.message.includes('rpc.example.com'), false, error.message);
  }
});

test('parseRetryAfter reads seconds, dates and garbage', () => {
  assert.equal(parseRetryAfter('3'), 3000);
  assert.equal(parseRetryAfter(null), null);
  assert.equal(parseRetryAfter('soon'), null);
  assert.equal(
    parseRetryAfter('Wed, 21 Oct 2015 07:28:10 GMT', Date.parse('Wed, 21 Oct 2015 07:28:00 GMT')),
    10000
  );
});

test('backoffDelay grows, jitters within 25% and is capped', () => {
  assert.equal(backoffDelay(0, {}, () => 0.5), 500);
  assert.equal(backoffDelay(1, {}, () => 0.5), 1000);
  assert.equal(backoffDelay(0, {}, () => 0), 375);
  assert.equal(backoffDelay(0, {}, () => 1), 625);
  assert.equal(backoffDelay(10, {}, () => 1), 8000);
});