'use strict';

/** Build a fetch-like response. `body` is JSON-encoded unless `text` is given. */
function makeResponse({ status = 200, body, text, headers = {} }) {
  const lower = {};
  for (const [key, value] of Object.entries(headers)) lower[key.toLowerCase()] = String(value);

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => {
        const value = lower[String(name).toLowerCase()];
        return value === undefined ? null : value;
      },
    },
    text: async () => (text !== undefined ? text : JSON.stringify(body === undefined ? {} : body)),
  };
}

/**
 * A fake fetch for tests. `steps` are answered in order, and the last one
 * repeats when they run out. A step is an object or a function
 * ({ url, init, request }) => object, with these keys:
 *   status, body, text, headers   a normal response
 *   error                         throw this instead of answering
 *   hang                          never answer; reject when the request is aborted
 * Every request is recorded in fetch.calls as { url, init, request }.
 */
function createMockFetch(steps) {
  const calls = [];
  let index = 0;

  async function mockFetch(url, init) {
    const request = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ url, init, request });

    const raw = steps[Math.min(index, steps.length - 1)];
    index += 1;
    const step = typeof raw === 'function' ? raw({ url, init, request }) : raw;

    if (step.error) throw step.error;

    if (step.hang) {
      return new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    }

    return makeResponse(step);
  }

  mockFetch.calls = calls;
  return mockFetch;
}

/** A successful JSON-RPC answer. */
function ok(result) {
  return { body: { jsonrpc: '2.0', id: 1, result } };
}

/** A JSON-RPC error answer (HTTP 200 with an error object). */
function rpcFail(code, message) {
  return { body: { jsonrpc: '2.0', id: 1, error: { code, message } } };
}

/** A plain HTTP failure such as 429 or 503. */
function http(status, extra = {}) {
  return { status, body: {}, ...extra };
}

module.exports = { createMockFetch, http, makeResponse, ok, rpcFail };