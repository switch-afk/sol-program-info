'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { base58Decode } = require('../src/address');
const { RpcError, createRpcClient } = require('../src/rpc');
const {
  SLICE,
  inspectProgram,
  lookupProgram,
  readProgramDataHeader,
} = require('../src/program');
const { createMockFetch, http, ok, rpcFail } = require('./helpers/mock-rpc');

const PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const PROGRAM_DATA = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const AUTHORITY = 'BPFLoaderUpgradeab1e11111111111111111111111';
const NATIVE = 'NativeLoader1111111111111111111111111111111';
const LOADER_V1 = 'BPFLoader1111111111111111111111111111111111';
const LOADER_V2 = 'BPFLoader2111111111111111111111111111111111';
const UPGRADEABLE = 'BPFLoaderUpgradeab1e11111111111111111111111';
const LOADER_V4 = 'LoaderV411111111111111111111111111111111111';
const SYSTEM = '11111111111111111111111111111111';

const SLOT = 250000000;
const BLOCK_TIME = 1760000000;

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

/** The first 45 bytes of a ProgramData account. */
function metadata({ variant = 3, slot = SLOT, authority = AUTHORITY, flag } = {}) {
  const buffer = Buffer.alloc(45);
  buffer.writeUInt32LE(variant, 0);
  buffer.writeBigUInt64LE(BigInt(slot), 4);
  if (authority) base58Decode(authority).copy(buffer, 13);
  buffer[12] = flag === undefined ? (authority ? 1 : 0) : flag;
  return buffer;
}

function programDataAccount({ owner = UPGRADEABLE, size = 134567, space, bytes = metadata() } = {}) {
  return {
    lamports: 1,
    owner,
    executable: false,
    rentEpoch: 0,
    space: space === undefined ? 45 + size : space,
    data: [bytes.toString('base64'), 'base64'],
  };
}

function reply(value) {
  return ok({ context: { slot: 1 }, value });
}

function upgradeableProgram() {
  return reply(account(UPGRADEABLE, { data: programData(2, PROGRAM_DATA) }));
}

function setup(steps) {
  const fetch = createMockFetch(steps);
  const rpc = createRpcClient({
    url: 'https://rpc.example.com/?key=secret123',
    fetch,
    sleep: async () => {},
    attempts: 1,
  });
  return {
    fetch,
    lookup: (id = PROGRAM) => lookupProgram(rpc, id),
    inspect: (id = PROGRAM) => inspectProgram(rpc, id),
  };
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
  const { lookup } = setup([upgradeableProgram()]);

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

test('inspect reads the ProgramData metadata, size and deploy time', async () => {
  const { fetch, inspect } = setup([
    upgradeableProgram(),
    reply(programDataAccount()),
    ok(BLOCK_TIME),
  ]);

  const info = await inspect();

  assert.equal(info.kind, 'upgradeable');
  assert.equal(info.programDataAddress, PROGRAM_DATA);
  assert.deepEqual(info.details, {
    state: 'ok',
    slot: SLOT,
    authority: AUTHORITY,
    sizeBytes: 134567,
    deployedAt: BLOCK_TIME,
    deployedNote: null,
  });

  assert.equal(fetch.calls.length, 3);
  assert.deepEqual(fetch.calls[1].request.params, [
    PROGRAM_DATA,
    { encoding: 'base64', dataSlice: { offset: 0, length: 45 }, commitment: 'confirmed' },
  ]);
  assert.equal(fetch.calls[2].request.method, 'getBlockTime');
  assert.deepEqual(fetch.calls[2].request.params, [SLOT]);
});

test('a frozen program has no authority', async () => {
  const bytes = metadata({ authority: null });
  const { inspect } = setup([
    upgradeableProgram(),
    reply(programDataAccount({ bytes })),
    ok(BLOCK_TIME),
  ]);

  const info = await inspect();

  assert.equal(info.details.state, 'ok');
  assert.equal(info.details.authority, null);
});

test('a closed program has no ProgramData account and no further calls', async () => {
  const { fetch, inspect } = setup([upgradeableProgram(), reply(null)]);

  const info = await inspect();

  assert.equal(info.kind, 'upgradeable');
  assert.deepEqual(info.details, { state: 'closed' });
  assert.equal(fetch.calls.length, 2);
});

test('a ProgramData account in the wrong shape makes the program unreadable', async () => {
  const cases = [
    programDataAccount({ bytes: metadata({ variant: 2 }) }),
    programDataAccount({ bytes: metadata({ flag: 7 }) }),
    programDataAccount({ bytes: Buffer.alloc(10) }),
    programDataAccount({ owner: SYSTEM }),
  ];

  for (const value of cases) {
    const { fetch, inspect } = setup([upgradeableProgram(), reply(value)]);
    const info = await inspect();
    assert.equal(info.kind, 'unreadable');
    assert.equal('details' in info, false);
    assert.equal(fetch.calls.length, 2);
  }
});

test('the size is unknown when the RPC does not report the full account size', async () => {
  for (const space of [undefined, 45, 0]) {
    const value = programDataAccount({ space: space === undefined ? 45 : space });
    if (space === undefined) delete value.space;

    const { inspect } = setup([upgradeableProgram(), reply(value), ok(BLOCK_TIME)]);
    const info = await inspect();

    assert.equal(info.details.sizeBytes, null);
  }
});

test('a missing block time does not hide the rest', async () => {
  const cases = [
    [ok(null), /no longer has that block/],
    [rpcFail(-32004, 'Block not available for slot 250000000'), /Block not available/],
    [http(429), /rate limiting/],
  ];

  for (const [step, pattern] of cases) {
    const { inspect } = setup([upgradeableProgram(), reply(programDataAccount()), step]);

    const info = await inspect();

    assert.equal(info.details.state, 'ok');
    assert.equal(info.details.authority, AUTHORITY);
    assert.equal(info.details.deployedAt, null);
    assert.match(info.details.deployedNote, pattern);
  }
});

test('programs on other loaders skip the ProgramData lookup', async () => {
  const { fetch, inspect } = setup([reply(account(LOADER_V2))]);

  const info = await inspect();

  assert.equal(info.kind, 'loader-v2');
  assert.equal('details' in info, false);
  assert.equal(fetch.calls.length, 1);
});

test('a failure reading ProgramData is reported, not swallowed', async () => {
  const { inspect } = setup([upgradeableProgram(), http(401)]);

  await assert.rejects(inspect(), (error) => {
    assert.ok(error instanceof RpcError);
    assert.equal(error.kind, 'auth');
    return true;
  });
});

test('readProgramDataHeader reads the slot and the authority flag', () => {
  assert.deepEqual(readProgramDataHeader(metadata()), { slot: SLOT, authority: AUTHORITY });
  assert.deepEqual(readProgramDataHeader(metadata({ authority: null })), {
    slot: SLOT,
    authority: null,
  });
  assert.equal(readProgramDataHeader(null), null);
});