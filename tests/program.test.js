'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { base58Decode } = require('../src/address');
const { RpcError, createRpcClient } = require('../src/rpc');
const { SLICE, lookupProgram } = require('../src/program');
const { createMockFetch, http, ok } = require('./helpers/mock-rpc');

const PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const PROGRAM_DATA = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const NATIVE = 'NativeLoader1111111111111111111111111111111';
const LOADER_V1 = 'BPFLoader1111111111111111111111111111111111';
const LOADER_V2 = 'BPFLoader2111111111111111111111111111111111';
const UPGRADEABLE = 'BPFLoaderUpgradeab1e11111111111111111111111';
const LOADER_V4 = 'LoaderV411111111111111111111111111111111111';
const SYSTEM = '11111111111111111111111111111111';

/** base64 of a 36 byte Program account slice: variant, then an address. */
function programData(variant, address) {
  const buffer = Buffer.alloc(36);
  buffer.writeUInt32LE(variant, 0);
  base58Decode(address).copy(buffer, 4);
  return buffer.toString('base64');
}

function account(owner, { executable = true, data = '' } = {}) {
  return {
    lamports: 1,
    owner,
    executable,
    rentEpoch: 0,
    space: 36,
    data: [data, 'base64'],
  };
}

function reply(value) {
  return ok({ context: { slot: 1 }, value });
}

function setup(steps) {
  const fetch = createMockFetch(steps);
  const rpc = createRpcClient({
    url: 'https://rpc.example.com/?key=secret123',
    fetch,
    sleep: async () => {},
    attempts: 1,
  });
  return { fetch, lookup: (id = PROGRAM) => lookupProgram(rpc, id) };
}

test('asks for only the first 36 bytes as base64', async () => {
  const { fetch, lookup } = setup([reply(account(LOADER_V2))]);

  await lookup();

  assert.equal(fetch.calls.length, 1);
  const { method, params } = fetch.calls[0].request;
  assert.equal(method, 'getAccountInfo');
  assert.deepEqual(params, [
    PROGRAM,
    { encoding: 'base64', dataSlice: { offset: 0, length: 36 }, commitment: 'confirmed' },
  ]);
  assert.deepEqual(SLICE, { offset: 0, length: 36 });
});

test('an upgradeable program reports its ProgramData address', async () => {
  const { lookup } = setup([reply(account(UPGRADEABLE, { data: programData(2, PROGRAM_DATA) }))]);

  const info = await lookup();

  assert.deepEqual(info, {
    programId: PROGRAM,
    kind: 'upgradeable',
    owner: UPGRADEABLE,
    programDataAddress: PROGRAM_DATA,
  });
});

test('older loaders and native programs are recognized by owner', async () => {
  const cases = [
    [LOADER_V1, 'loader-v1'],
    [LOADER_V2, 'loader-v2'],
    [LOADER_V4, 'loader-v4'],
    [NATIVE, 'native'],
  ];

  for (const [owner, kind] of cases) {
    const { lookup } = setup([reply(account(owner))]);
    const info = await lookup();
    assert.equal(info.kind, kind);
    assert.equal(info.owner, owner);
    assert.equal(info.programDataAddress, null);
  }
});

test('an executable account with an unknown owner is reported as such', async () => {
  const { lookup } = setup([reply(account(PROGRAM_DATA))]);

  const info = await lookup();

  assert.equal(info.kind, 'unknown-loader');
  assert.equal(info.owner, PROGRAM_DATA);
});

test('a missing account is not-found', async () => {
  const { lookup } = setup([reply(null)]);

  const info = await lookup();

  assert.equal(info.kind, 'not-found');
  assert.equal(info.owner, null);
});

test('an account that is not executable is not-a-program', async () => {
  const { lookup } = setup([reply(account(SYSTEM, { executable: false }))]);

  const info = await lookup();

  assert.equal(info.kind, 'not-a-program');
  assert.equal(info.owner, SYSTEM);
});

test('upgradeable loader data in the wrong shape is unreadable', async () => {
  const wrongVariant = programData(3, PROGRAM_DATA);
  const tooShort = Buffer.from([2, 0, 0, 0]).toString('base64');

  for (const data of [wrongVariant, tooShort, '']) {
    const { lookup } = setup([reply(account(UPGRADEABLE, { data }))]);
    const info = await lookup();
    assert.equal(info.kind, 'unreadable');
    assert.equal(info.programDataAddress, null);
  }
});

test('an answer without the expected shape is a bad response', async () => {
  for (const step of [ok(null), ok({})]) {
    const { lookup } = setup([step]);
    await assert.rejects(lookup(), (error) => {
      assert.ok(error instanceof RpcError);
      assert.equal(error.kind, 'bad-response');
      return true;
    });
  }
});

test('RPC failures pass through as RpcError', async () => {
  const { lookup } = setup([http(429)]);

  await assert.rejects(lookup(), (error) => {
    assert.ok(error instanceof RpcError);
    assert.equal(error.rateLimited, true);
    return true;
  });
});