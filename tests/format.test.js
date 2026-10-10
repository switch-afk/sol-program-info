'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { explainProblem, formatProgram } = require('../src/format');

const PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const PROGRAM_DATA = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const LOADER_V2 = 'BPFLoader2111111111111111111111111111111111';
const UPGRADEABLE = 'BPFLoaderUpgradeab1e11111111111111111111111';
const NATIVE = 'NativeLoader1111111111111111111111111111111';
const SYSTEM = '11111111111111111111111111111111';

function info(extra) {
  return { programId: PROGRAM, owner: null, programDataAddress: null, ...extra };
}

test('a loader v2 program says it can never be upgraded', () => {
  const text = formatProgram(info({ kind: 'loader-v2', owner: LOADER_V2 }));

  assert.match(text, /^Program: +TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA$/m);
  assert.match(text, /^Type: +program$/m);
  assert.match(text, /^Loader: +BPF Loader v2 \(BPFLoader2/m);
  assert.match(text, /^Upgrades: +never/m);
  assert.equal(/ProgramData/.test(text), false);
  assert.ok(text.endsWith('\n'));
});

test('an upgradeable program shows its ProgramData address', () => {
  const text = formatProgram(
    info({ kind: 'upgradeable', owner: UPGRADEABLE, programDataAddress: PROGRAM_DATA })
  );

  assert.match(text, /^ProgramData: +JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4$/m);
  assert.match(text, /^Loader: +Upgradeable BPF Loader/m);
  assert.match(text, /^Upgrades: +depends on the upgrade authority/m);
});

test('a native program is called built-in', () => {
  const text = formatProgram(info({ kind: 'native', owner: NATIVE }));

  assert.match(text, /^Type: +built-in program$/m);
  assert.match(text, /^Upgrades: +only by a validator software release/m);
});

test('an unrecognized loader is labelled as unknown', () => {
  const text = formatProgram(info({ kind: 'unknown-loader', owner: PROGRAM_DATA }));

  assert.match(text, /^Owner: +JUP6Lkb.* \(loader not recognized\)$/m);
  assert.match(text, /^Upgrades: +unknown/m);
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