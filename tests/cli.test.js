'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');
const { base58Decode } = require('../src/address');
const { run } = require('../src/cli');
const { createMockFetch, http, ok } = require('./helpers/mock-rpc');

const PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const PROGRAM_DATA = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const LOADER_V2 = 'BPFLoader2111111111111111111111111111111111';
const UPGRADEABLE = 'BPFLoaderUpgradeab1e11111111111111111111111';
const SYSTEM = '11111111111111111111111111111111';

function programData(address) {
  const buffer = Buffer.alloc(36);
  buffer.writeUInt32LE(2, 0);
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

/** Every test gets a mock fetch, so nothing here can reach the network. */
function capture({ env = {}, steps = [reply(account(LOADER_V2))], rpc = {} } = {}) {
  const out = [];
  const err = [];
  const fetch = createMockFetch(steps);
  return {
    fetch,
    io: {
      stdout: { write: (text) => out.push(text) },
      stderr: { write: (text) => err.push(text) },
      env,
      rpcOptions: { fetch, sleep: async () => {}, random: () => 0.5, ...rpc },
    },
    stdout: () => out.join(''),
    stderr: () => err.join(''),
  };
}

test('--help prints usage, the env var and the exit codes', async () => {
  const c = capture();
  assert.equal(await run(['--help'], c.io), 0);
  assert.match(c.stdout(), /Usage:/);
  assert.match(c.stdout(), /SOL_PROGRAM_INFO_RPC/);
  assert.match(c.stdout(), /3 {2}the RPC lookup failed/);
  assert.match(c.stdout(), /4 {2}the address is not a program/);
  assert.equal(c.stderr(), '');
});

test('--version prints the package version', async () => {
  const c = capture();
  assert.equal(await run(['--version'], c.io), 0);
  assert.equal(c.stdout(), `${pkg.version}\n`);
});

test('no program ID exits 2', async () => {
  const c = capture();
  assert.equal(await run([], c.io), 2);
  assert.match(c.stderr(), /Expected a program ID/);
});

test('an unknown option exits 2', async () => {
  const c = capture();
  assert.equal(await run(['--nope', PROGRAM], c.io), 2);
  assert.match(c.stderr(), /Unknown option: --nope/);
});

test('more than one program ID exits 2', async () => {
  const c = capture();
  assert.equal(await run([PROGRAM, PROGRAM], c.io), 2);
  assert.match(c.stderr(), /Expected one program ID, got 2/);
});

test('an invalid program ID exits 1 and never calls the RPC', async () => {
  const c = capture();
  assert.equal(await run(['not-a-program'], c.io), 1);
  assert.match(c.stderr(), /Not a valid program ID \(not-a-program\)/);
  assert.equal(c.fetch.calls.length, 0);
});

test('a bad endpoint setting exits 1 without echoing the value', async () => {
  const c = capture({ env: { SOL_PROGRAM_INFO_RPC: 'wss://rpc.example.com/?key=secret123' } });
  assert.equal(await run([PROGRAM], c.io), 1);
  assert.match(c.stderr(), /SOL_PROGRAM_INFO_RPC must start with http/);
  assert.equal(c.stderr().includes('secret123'), false);
  assert.equal(c.fetch.calls.length, 0);
});

test('a legacy program prints its details to stdout and exits 0', async () => {
  const c = capture();

  assert.equal(await run([PROGRAM], c.io), 0);

  assert.match(c.stdout(), /^Program: +TokenkegQfe/m);
  assert.match(c.stdout(), /^Loader: +BPF Loader v2/m);
  assert.match(c.stdout(), /^Upgrades: +never/m);
  assert.match(c.stderr(), /Using api\.mainnet-beta\.solana\.com\./);
  assert.equal(c.fetch.calls.length, 1);
});

test('an upgradeable program prints its ProgramData address', async () => {
  const c = capture({
    steps: [reply(account(UPGRADEABLE, { data: programData(PROGRAM_DATA) }))],
  });

  assert.equal(await run([PROGRAM], c.io), 0);

  assert.match(c.stdout(), /^ProgramData: +JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4$/m);
});

test('your own endpoint shows only its hostname, never the key', async () => {
  const c = capture({
    env: { SOL_PROGRAM_INFO_RPC: 'https://rpc.example.com/v2/secret123?key=secret123' },
  });

  assert.equal(await run([PROGRAM], c.io), 0);

  assert.match(c.stderr(), /Using rpc\.example\.com\./);
  assert.equal(c.stderr().includes('secret123'), false);
  assert.equal(c.stdout().includes('secret123'), false);
  assert.match(c.fetch.calls[0].url, /secret123/);
});

test('a missing account exits 4 with a clear message on stderr', async () => {
  const c = capture({ steps: [reply(null)] });

  assert.equal(await run([PROGRAM], c.io), 4);

  assert.match(c.stderr(), /No account found at TokenkegQfe/);
  assert.equal(c.stdout(), '');
});

test('a wallet address exits 4 and says it is a wallet', async () => {
  const c = capture({ steps: [reply(account(SYSTEM, { executable: false }))] });

  assert.equal(await run([PROGRAM], c.io), 4);

  assert.match(c.stderr(), /is a wallet/);
  assert.equal(c.stdout(), '');
});

test('unreadable upgradeable data exits 3', async () => {
  const c = capture({ steps: [reply(account(UPGRADEABLE, { data: '' }))] });

  assert.equal(await run([PROGRAM], c.io), 3);

  assert.match(c.stderr(), /not in the expected format/);
});

test('a rate limit is retried, with one notice and one hint', async () => {
  const c = capture({ steps: [http(429), http(429), reply(account(LOADER_V2))] });

  assert.equal(await run([PROGRAM], c.io), 0);

  const text = c.stderr();
  assert.equal(text.split('Retrying in').length - 1, 2);
  assert.equal(text.split('rate-limits heavily').length - 1, 1);
  assert.match(text, /SOL_PROGRAM_INFO_RPC/);
  assert.match(c.stdout(), /BPF Loader v2/);
});

test('a steady rate limit exits 3 after the allowed attempts', async () => {
  const c = capture({ steps: [http(429)], rpc: { attempts: 2 } });

  assert.equal(await run([PROGRAM], c.io), 3);

  assert.match(c.stderr(), /Could not look up the program on api\.mainnet-beta\.solana\.com/);
  assert.match(c.stderr(), /rate limiting/);
  assert.equal(c.stderr().split('rate-limits heavily').length - 1, 1);
  assert.equal(c.fetch.calls.length, 2);
  assert.equal(c.stdout(), '');
});

test('with your own RPC the hint is about plan limits', async () => {
  const c = capture({
    env: { SOL_PROGRAM_INFO_RPC: 'https://rpc.example.com/?key=secret123' },
    steps: [http(429)],
    rpc: { attempts: 1 },
  });

  assert.equal(await run([PROGRAM], c.io), 3);

  assert.match(c.stderr(), /plan's limits/);
  assert.equal(c.stderr().includes('rate-limits heavily'), false);
  assert.equal(c.stderr().includes('secret123'), false);
});

test('a rejected API key exits 3 at once, with no retries and no key leak', async () => {
  const c = capture({
    env: { SOL_PROGRAM_INFO_RPC: 'https://rpc.example.com/?key=secret123' },
    steps: [http(401)],
  });

  assert.equal(await run([PROGRAM], c.io), 3);

  assert.match(c.stderr(), /HTTP 401/);
  assert.match(c.stderr(), /API key/);
  assert.equal(c.stderr().includes('Retrying'), false);
  assert.equal(c.stderr().includes('secret123'), false);
  assert.equal(c.fetch.calls.length, 1);
});