'use strict';

const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';
const RPC_ENV = 'SOL_PROGRAM_INFO_RPC';
const PUBLIC_HOSTS = new Set([
  'api.mainnet-beta.solana.com',
  'api.devnet.solana.com',
  'api.testnet.solana.com',
]);

class EndpointError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EndpointError';
  }
}

/**
 * Only the hostname is ever printed. RPC URLs often carry an API key
 * in the path or query string, so the full URL never reaches the output.
 */
function hostLabel(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'the endpoint';
  }
}

/**
 * Pick the RPC endpoint: SOL_PROGRAM_INFO_RPC if set, else the public one.
 * Error messages never include the value, because it may contain an API key.
 * isPublic is true for Solana's free public endpoints, which rate-limit heavily.
 */
function resolveEndpoint(env = process.env) {
  const value = typeof env[RPC_ENV] === 'string' ? env[RPC_ENV].trim() : '';

  if (value === '') {
    return { rpcUrl: DEFAULT_RPC, host: hostLabel(DEFAULT_RPC), isPublic: true };
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new EndpointError(`${RPC_ENV} is not a valid URL.`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new EndpointError(`${RPC_ENV} must start with http:// or https://.`);
  }

  return {
    rpcUrl: parsed.toString(),
    host: parsed.hostname,
    isPublic: PUBLIC_HOSTS.has(parsed.hostname),
  };
}

/** One-line advice for when the endpoint is throttling us. */
function rateLimitHint(endpoint) {
  if (endpoint.isPublic) {
    return `The public RPC rate-limits heavily. Set ${RPC_ENV} to your own endpoint to avoid this.`;
  }
  return "Your RPC endpoint is rate limiting requests. Wait a moment and check your plan's limits.";
}

module.exports = {
  DEFAULT_RPC,
  EndpointError,
  RPC_ENV,
  hostLabel,
  rateLimitHint,
  resolveEndpoint,
};