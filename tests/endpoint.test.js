'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EndpointError,
  RPC_ENV,
  hostLabel,
  rateLimitHint,
  resolveEndpoint,
} = require('../src/endpoint');

const KEYED = 'https://rpc.example.com/v2/secret123?api-key=secret123';

test('no setting falls back to the public endpoint', () => {
  const endpoint = resolveEndpoint({});
  assert.equal(endpoint.rpcUrl, 'https://api.mainnet-beta.solana.com');
  assert.equal(endpoint.host, 'api.mainnet-beta.solana.com');
  assert.equal(endpoint.isPublic, true);
});

test('an empty or blank setting counts as not set', () => {
  assert.equal(resolveEndpoint({ [RPC_ENV]: '' }).isPublic, true);
  assert.equal(resolveEndpoint({ [RPC_ENV]: '   ' }).isPublic, true);
});

test('your own endpoint is used and only its host is exposed', () => {
  const endpoint = resolveEndpoint({ [RPC_ENV]: KEYED });
  assert.equal(endpoint.rpcUrl, KEYED);
  assert.equal(endpoint.host, 'rpc.example.com');
  assert.equal(endpoint.isPublic, false);
});

test('http:// is allowed, for a local validator', () => {
  const endpoint = resolveEndpoint({ [RPC_ENV]: 'http://localhost:8899' });
  assert.equal(endpoint.host, 'localhost');
  assert.equal(endpoint.isPublic, false);
});

test('setting the public URL yourself still counts as public', () => {
  const endpoint = resolveEndpoint({ [RPC_ENV]: 'https://api.devnet.solana.com' });
  assert.equal(endpoint.isPublic, true);
});

test('a WebSocket URL is rejected without echoing the value', () => {
  assert.throws(
    () => resolveEndpoint({ [RPC_ENV]: 'wss://rpc.example.com/?api-key=secret123' }),
    (error) => {
      assert.ok(error instanceof EndpointError);
      assert.match(error.message, /must start with http:\/\/ or https:\/\//);
      assert.equal(error.message.includes('secret123'), false);
      return true;
    }
  );
});

test('something that is not a URL is rejected without echoing the value', () => {
  assert.throws(
    () => resolveEndpoint({ [RPC_ENV]: 'not a url secret123' }),
    (error) => {
      assert.ok(error instanceof EndpointError);
      assert.match(error.message, /not a valid URL/);
      assert.equal(error.message.includes('secret123'), false);
      return true;
    }
  );
});

test('hostLabel keeps only the hostname', () => {
  assert.equal(hostLabel(KEYED), 'rpc.example.com');
  assert.equal(hostLabel('not a url'), 'the endpoint');
});

test('the rate-limit hint depends on whether you use the public RPC', () => {
  const publicHint = rateLimitHint({ isPublic: true });
  assert.match(publicHint, /public RPC/);
  assert.match(publicHint, new RegExp(RPC_ENV));

  const ownHint = rateLimitHint({ isPublic: false });
  assert.match(ownHint, /plan's limits/);
  assert.equal(ownHint.includes(RPC_ENV), false);
});