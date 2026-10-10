'use strict';

const DEFAULT_OPTIONS = {
  attempts: 4,
  initialDelayMs: 500,
  maxDelayMs: 8000,
  timeoutMs: 15000,
};

const RETRYABLE = new Set(['rate-limited', 'server', 'network', 'timeout']);

/**
 * Something went wrong talking to the RPC. `kind` is one of:
 *   rate-limited, auth, not-found, server, network, timeout, rpc, bad-response.
 * The message is plain English and never contains the endpoint URL.
 */
class RpcError extends Error {
  constructor(message, kind) {
    super(message);
    this.name = 'RpcError';
    this.kind = kind;
    this.rateLimited = kind === 'rate-limited';
    this.retryable = RETRYABLE.has(kind);
    this.retryAfterMs = null;
  }
}

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Exponential backoff with +/-25% jitter, never above maxDelayMs. */
function backoffDelay(attempt, options = {}, random = Math.random) {
  const { initialDelayMs, maxDelayMs } = { ...DEFAULT_OPTIONS, ...options };
  const base = Math.min(maxDelayMs, initialDelayMs * 2 ** attempt);
  return Math.min(maxDelayMs, Math.round(base * (0.75 + random() * 0.5)));
}

/** A Retry-After header is seconds or an HTTP date. Returns milliseconds, or null. */
function parseRetryAfter(value, now = Date.now()) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return Number(text) * 1000;
  const date = Date.parse(text);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
}

function looksRateLimited(code, message) {
  return code === 429 || /rate.?limit|too many requests/i.test(String(message || ''));
}

/** Turn a thrown fetch error into a plain-English RpcError. */
function classifyNetworkError(error) {
  if (error && error.name === 'AbortError') {
    return new RpcError('the endpoint did not answer in time', 'timeout');
  }

  const code = (error && error.cause && error.cause.code) || (error && error.code) || '';

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return new RpcError('could not find the endpoint host (DNS lookup failed)', 'network');
  }
  if (code === 'ECONNREFUSED') {
    return new RpcError('the endpoint refused the connection', 'network');
  }
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_HEADERS_TIMEOUT') {
    return new RpcError('the connection timed out', 'timeout');
  }
  if (code === 'ECONNRESET' || code === 'UND_ERR_SOCKET') {
    return new RpcError('the connection was reset', 'network');
  }
  return new RpcError('could not reach the endpoint', 'network');
}

/** Turn an HTTP response and its body text into a result, or throw an RpcError. */
function interpret(response, text) {
  const status = response.status;

  if (status === 429) {
    const error = new RpcError('the endpoint is rate limiting requests (HTTP 429)', 'rate-limited');
    error.retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
    throw error;
  }
  if (status === 401 || status === 403) {
    throw new RpcError(
      `the endpoint rejected the request (HTTP ${status}); check the API key in your endpoint URL`,
      'auth'
    );
  }
  if (status === 404) {
    throw new RpcError('the endpoint was not found (HTTP 404); check the URL', 'not-found');
  }
  if (status >= 500) {
    throw new RpcError(`the endpoint had a server error (HTTP ${status})`, 'server');
  }
  if (status < 200 || status >= 300) {
    throw new RpcError(`the endpoint answered with HTTP ${status}`, 'bad-response');
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new RpcError('the endpoint did not return JSON', 'bad-response');
  }
  if (!body || typeof body !== 'object') {
    throw new RpcError('the endpoint did not return JSON', 'bad-response');
  }

  if (body.error) {
    const message = typeof body.error.message === 'string' ? body.error.message : 'unknown error';
    if (looksRateLimited(body.error.code, message)) {
      throw new RpcError('the endpoint is rate limiting requests', 'rate-limited');
    }
    throw new RpcError(message, 'rpc');
  }

  if (!('result' in body)) {
    throw new RpcError('the endpoint answer had no result', 'bad-response');
  }
  return body.result;
}

/**
 * A small JSON-RPC client over fetch.
 *
 * call(method, params) resolves to the result, or rejects with an RpcError.
 * Rate limits, server errors, network errors and timeouts are retried with
 * backoff (a Retry-After header is respected); everything else fails at once.
 * onRetry({ attempt, delayMs, error }) is called before each wait.
 */
function createRpcClient(options) {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const { url, onRetry = () => {} } = settings;
  const fetchImpl = settings.fetch || globalThis.fetch;
  const sleep = settings.sleep || sleepFor;
  const random = settings.random || Math.random;
  let nextId = 1;

  async function once(method, params) {
    const id = nextId;
    nextId += 1;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settings.timeoutMs);

    try {
      let response;
      let text;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
          signal: controller.signal,
        });
        text = await response.text();
      } catch (error) {
        throw classifyNetworkError(error);
      }
      return interpret(response, text);
    } finally {
      clearTimeout(timer);
    }
  }

  async function call(method, params = []) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await once(method, params);
      } catch (error) {
        const isLast = attempt >= settings.attempts - 1;
        if (!(error instanceof RpcError) || !error.retryable || isLast) throw error;

        let delayMs = backoffDelay(attempt, settings, random);
        if (error.retryAfterMs !== null) {
          delayMs = Math.min(settings.maxDelayMs, Math.max(delayMs, error.retryAfterMs));
        }
        onRetry({ attempt: attempt + 1, delayMs, error });
        await sleep(delayMs);
      }
    }
  }

  return { call };
}

module.exports = {
  DEFAULT_OPTIONS,
  RpcError,
  backoffDelay,
  createRpcClient,
  parseRetryAfter,
};