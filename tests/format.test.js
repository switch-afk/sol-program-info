'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { explainProblem, formatAge, formatBytes, formatProgram, withCommas } = require('../src/format');

const PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const PROGRAM_DATA = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const AUTHORITY = 'BPFLoaderUpgradeab1e11111111111111111111111';
const LOADER_V2 = 'BPFLoader2111111111111111111111111111111111';
const UPGRADEABLE = 'BPFLoaderUpgradeab1e11111111111111111111111';
const NATIVE = 'NativeLoader1111111111111111111111111111111';
const SYSTEM = '11111111111111111111111111111111';

const DAY = 24 * 60 * 60 * 1000;
const BLOCK_TIME = 1760000000; // 2025-10-09 08:53:20 UTC
const NOW = Date.parse('2026-10-10T00:00:00Z');

function info(extra) {
  return { programId: PROGRAM, owner: null, programDataAddress: null, ...extra };
}

function upgradeable(details) {
  return info({
    kind: 'upgradeable',
    owner: UPGRADEABLE,
    programDataAddress: PROGRAM_DATA,
    details,
  });
}

const OK_DETAILS = {
  state: 'ok',
  slot: 250000000,
  authority: AUTHORITY,
  sizeBytes: 134567,
  deployedAt: BLOCK_TIME,
  deployedNote: null,
};

test('a loader v2 program says it can never be upgraded', () => {
  const text = formatProgram(info({ kind: 'loader-v2', owner: LOADER_V2 }), NOW);

  assert.match(text, /^Program: +TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA$/m);
  assert.match(text, /^Type: +program$/m);
  assert.match(text, /^Loader: +BPF Loader v2 \(BPFLoader2/m);
  assert.match(text, /^Upgrades: +never/m);
  assert.equal(/ProgramData/.test(text), false);
  assert.ok(text.endsWith('\n'));
});

test('an upgradeable program with an authority shows every row', () => {
  const text = formatProgram(upgradeable(OK_DETAILS), NOW);

  assert.match(text, /^ProgramData: +JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4$/m);
  assert.match(text, /^Loader: +Upgradeable BPF Loader/m);
  assert.match(text, /^Authority: +BPFLoaderUpgradeab1e11111111111111111111111$/m);
  assert.match(
    text,
    /^Last deployed: +slot 250,000,000, 2025-10-09 08:53 UTC \(about 12 months ago\)$/m
  );
  assert.match(text, /^Size: +134,567 bytes \(131\.4 KiB\)$/m);
  assert.match(text, /^Upgrades: +yes, by whoever can sign as the upgrade authority$/m);
});

test('rows are aligned to the longest label', () => {
  const lines = formatProgram(upgradeable(OK_DETAILS), NOW).trimEnd().split('\n');
  const starts = lines.map((line) => line.match(/^[A-Za-z ]+: +/)[0].length);
  assert.equal(new Set(starts).size, 1);
});

test('a frozen program says it can never change', () => {
  const text = formatProgram(upgradeable({ ...OK_DETAILS, authority: null }), NOW);

  assert.match(text, /^Authority: +none; the upgrade authority was removed$/m);
  assert.match(text, /^Upgrades: +never; the program is frozen$/m);
});

test('an unknown size leaves out the Size row', () => {
  const text = formatProgram(upgradeable({ ...OK_DETAILS, sizeBytes: null }), NOW);

  assert.equal(/Size:/.test(text), false);
  assert.match(text, /^Authority:/m);
});

test('a missing deploy date shows the slot and the reason', () => {
  const text = formatProgram(
    upgradeable({ ...OK_DETAILS, deployedAt: null, deployedNote: 'the RPC no longer has that block' }),
    NOW
  );

  assert.match(
    text,
    /^Last deployed: +slot 250,000,000, date unavailable: the RPC no longer has that block$/m
  );
});

test('a closed program says so instead of showing an authority', () => {
  const text = formatProgram(upgradeable({ state: 'closed' }), NOW);

  assert.match(text, /^Status: +closed; its ProgramData account no longer exists/m);
  assert.match(text, /^Upgrades: +not applicable; the program is closed$/m);
  assert.equal(/Authority:/.test(text), false);
});

test('an upgradeable program without details falls back to the loader text', () => {
  const text = formatProgram(info({ kind: 'upgradeable', owner: UPGRADEABLE, programDataAddress: PROGRAM_DATA }), NOW);

  assert.match(text, /^Upgrades: +depends on the upgrade authority$/m);
});

test('a native program is called built-in', () => {
  const text = formatProgram(info({ kind: 'native', owner: NATIVE }), NOW);

  assert.match(text, /^Type: +built-in program$/m);
  assert.match(text, /^Upgrades: +only by a validator software release/m);
});

test('an unrecognized loader is labelled as unknown', () => {
  const text = formatProgram(info({ kind: 'unknown-loader', owner: PROGRAM_DATA }), NOW);

  assert.match(text, /^Owner: +JUP6Lkb.* \(loader not recognized\)$/m);
  assert.match(text, /^Upgrades: +unknown/m);
});

test('formatAge uses days, months and years', () => {
  assert.equal(formatAge(0), 'today');
  assert.equal(formatAge(-5 * DAY), 'today');
  assert.equal(formatAge(1 * DAY), '1 day ago');
  assert.equal(formatAge(10 * DAY), '10 days ago');
  assert.equal(formatAge(90 * DAY), 'about 3 months ago');
  assert.equal(formatAge(400 * DAY), 'about 13 months ago');
  assert.equal(formatAge(800 * DAY), 'about 2 years ago');
});

test('numbers get thousands separators', () => {
  assert.equal(withCommas(0), '0');
  assert.equal(withCommas(999), '999');
  assert.equal(withCommas(1000), '1,000');
  assert.equal(withCommas(250000000), '250,000,000');
  assert.equal(formatBytes(134567), '134,567 bytes (131.4 KiB)');
});

test('not-found points at the program ID and the network', () => {
  const text = explainProblem(info({ kind: 'not-found' }), 'rpc.example.com');

  assert.match(text, /No account found at TokenkegQfe/);
  assert.match(text, /on rpc\.example\.com/);
  assert.match(text, /right network/);
});

test('not-a-program explains what the address actually is', () => {
  const wallet = explainProblem(info({ kind: 'not-a-program', owner: SYSTEM }), 'h');
  assert.match(wallet, /is a wallet/);

  const data = explainProblem(info({ kind: 'not-a-program', owner: UPGRADEABLE }), 'h');
  assert.match(data, /program data or buffer account/);
  assert.match(data, /program's own ID/);

  const other = explainProblem(info({ kind: 'not-a-program', owner: PROGRAM }), 'h');
  assert.match(other, /not an executable program/);
  assert.match(other, /owned by TokenkegQfe/);
});

test('unreadable says the data was not in the expected format', () => {
  const text = explainProblem(info({ kind: 'unreadable', owner: UPGRADEABLE }), 'h');
  assert.match(text, /not in the expected format/);
});

test('kinds with nothing to explain give an empty string', () => {
  assert.equal(explainProblem(info({ kind: 'loader-v2' }), 'h'), '');
});