'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');
const { run } = require('../src/cli');

const PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

function capture() {
  const out = [];
  const err = [];
  return {
    io: {
      stdout: { write: (text) => out.push(text) },
      stderr: { write: (text) => err.push(text) },
    },
    stdout: () => out.join(''),
    stderr: () => err.join(''),
  };
}

test('--help prints usage and exits 0', async () => {
  const c = capture();
  assert.equal(await run(['--help'], c.io), 0);
  assert.match(c.stdout(), /Usage:/);
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

test('an invalid program ID exits 1 and says why', async () => {
  const c = capture();
  assert.equal(await run(['not-a-program'], c.io), 1);
  assert.match(c.stderr(), /Not a valid program ID \(not-a-program\)/);
});

test('a valid program ID exits 0', async () => {
  const c = capture();
  assert.equal(await run([PROGRAM], c.io), 0);
  assert.match(c.stdout(), /is a valid program ID/);
});