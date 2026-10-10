'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { describe, shortAddress, toJson } = require('../src/report');

const PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const PROGRAM_DATA = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const AUTHORITY = 'CvQZZ23qYDWF2RUpxYJ8y9K4skmuvYEEjH7fK58jtipQ';
const LOADER_V1 = 'BPFLoader1111111111111111111111111111111111';
const LOADER_V2 = 'BPFLoader2111111111111111111111111111111111';
const LOADER_V4 = 'LoaderV411111111111111111111111111111111111';
const UPGRADEABLE = 'BPFLoaderUpgradeab1e11111111111111111111111';
const NATIVE = 'NativeLoader1111111111111111111111111111111';

const BLOCK_TIME = 1760000000; // 2025-10-09 08:53:20 UTC
const NOW = Date.parse('2026-10-10T00:00:00Z');

function info(extra) {
  return { programId: PROGRAM, owner: null, programDataAddress: null, ...extra };
}

const OK_DETAILS = {
  state: 'ok',
  slot: 250000000,
  authority: AUTHORITY,
  sizeBytes: 134567,
  deployedAt: BLOCK_TIME,
  deployedNote: null,
};

function upgradeable(details) {
  return info({
    kind: 'upgradeable',
    owner: UPGRADEABLE,
    programDataAddress: PROGRAM_DATA,
    details,
  });
}

test('shortAddress keeps the first and last four characters', () => {
  assert.equal(shortAddress(AUTHORITY), 'CvQZ...tipQ');
  assert.equal(shortAddress('short'), 'short');
});

test('an upgradeable program names its authority and when it last changed', () => {
  const result = describe(upgradeable(OK_DETAILS), NOW);

  assert.equal(result.verdict, 'upgradeable');
  assert.equal(result.canUpgrade, true);
  assert.match(result.summary, /^Upgradeable: whoever can sign as CvQZ\.\.\.tipQ can replace/);
  assert.match(result.summary, /Last deployed about 12 months ago\.$/);
});

test('an upgradeable program without a deploy date leaves that sentence out', () => {
  const result = describe(upgradeable({ ...OK_DETAILS, deployedAt: null }), NOW);

  assert.equal(result.verdict, 'upgradeable');
  assert.equal(/Last deployed/.test(result.summary), false);
});

test('a program with no authority is frozen', () => {
  const result = describe(upgradeable({ ...OK_DETAILS, authority: null }), NOW);

  assert.equal(result.verdict, 'frozen');
  assert.equal(result.canUpgrade, false);
  assert.match(result.summary, /^Frozen: the upgrade authority was removed/);
  assert.match(result.summary, /can never change\.$/);
});

test('a closed program says it cannot run', () => {
  const result = describe(upgradeable({ state: 'closed' }), NOW);

  assert.equal(result.verdict, 'closed');
  assert.equal(result.canUpgrade, false);
  assert.match(result.summary, /^Closed:/);
});

test('old loaders are immutable', () => {
  for (const [kind, owner] of [
    ['loader-v1', LOADER_V1],
    ['loader-v2', LOADER_V2],
  ]) {
    const result = describe(info({ kind, owner }), NOW);
    assert.equal(result.verdict, 'immutable');
    assert.equal(result.canUpgrade, false);
    assert.match(result.summary, /^Immutable:/);
  }
});

test('a native program is built-in', () => {
  const result = describe(info({ kind: 'native', owner: NATIVE }), NOW);

  assert.equal(result.verdict, 'built-in');
  assert.equal(result.canUpgrade, false);
  assert.match(result.summary, /validator software release/);
});

test('Loader v4 and unknown loaders are honest about not knowing', () => {
  const v4 = describe(info({ kind: 'loader-v4', owner: LOADER_V4 }), NOW);
  assert.equal(v4.verdict, 'unknown');
  assert.equal(v4.canUpgrade, null);
  assert.match(v4.summary, /^Loader v4:/);

  const other = describe(info({ kind: 'unknown-loader', owner: PROGRAM_DATA }), NOW);
  assert.equal(other.verdict, 'unknown');
  assert.equal(other.canUpgrade, null);
  assert.match(other.summary, /^Unknown loader:/);
});

test('toJson has every field for an upgradeable program', () => {
  const { summary, ...rest } = toJson(upgradeable(OK_DETAILS), NOW);

  assert.match(summary, /^Upgradeable:/);
  assert.deepEqual(rest, {
    programId: PROGRAM,
    kind: 'upgradeable',
    verdict: 'upgradeable',
    canUpgrade: true,
    loader: { address: UPGRADEABLE, name: 'Upgradeable BPF Loader' },
    programData: PROGRAM_DATA,
    authority: AUTHORITY,
    lastDeployed: { slot: 250000000, time: '2025-10-09T08:53:20.000Z', timeNote: null },
    sizeBytes: 134567,
  });
});

test('toJson for a frozen program has a null authority', () => {
  const json = toJson(upgradeable({ ...OK_DETAILS, authority: null }), NOW);

  assert.equal(json.verdict, 'frozen');
  assert.equal(json.canUpgrade, false);
  assert.equal(json.authority, null);
  assert.equal(json.lastDeployed.slot, 250000000);
});

test('toJson keeps the reason when the deploy date is unavailable', () => {
  const json = toJson(
    upgradeable({ ...OK_DETAILS, deployedAt: null, deployedNote: 'the RPC no longer has that block' }),
    NOW
  );

  assert.deepEqual(json.lastDeployed, {
    slot: 250000000,
    time: null,
    timeNote: 'the RPC no longer has that block',
  });
});

test('toJson for an unknown size has a null sizeBytes', () => {
  const json = toJson(upgradeable({ ...OK_DETAILS, sizeBytes: null }), NOW);
  assert.equal(json.sizeBytes, null);
});

test('toJson for a closed program has no deploy details', () => {
  const json = toJson(upgradeable({ state: 'closed' }), NOW);

  assert.equal(json.verdict, 'closed');
  assert.equal(json.lastDeployed, null);
  assert.equal(json.authority, null);
  assert.equal(json.sizeBytes, null);
  assert.equal(json.programData, PROGRAM_DATA);
});

test('toJson for a legacy program has no ProgramData fields', () => {
  const json = toJson(info({ kind: 'loader-v2', owner: LOADER_V2 }), NOW);

  assert.equal(json.programData, null);
  assert.equal(json.authority, null);
  assert.equal(json.lastDeployed, null);
  assert.equal(json.sizeBytes, null);
  assert.deepEqual(json.loader, { address: LOADER_V2, name: 'BPF Loader v2' });
});

test('toJson for an unrecognized loader has no loader name', () => {
  const json = toJson(info({ kind: 'unknown-loader', owner: PROGRAM_DATA }), NOW);

  assert.deepEqual(json.loader, { address: PROGRAM_DATA, name: null });
  assert.equal(json.canUpgrade, null);
});

test('the result survives JSON.stringify and parse unchanged', () => {
  const json = toJson(upgradeable(OK_DETAILS), NOW);
  assert.deepEqual(JSON.parse(JSON.stringify(json)), json);
});