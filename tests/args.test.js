'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs } = require('../src/args');

test('no arguments gives empty defaults', () => {
  assert.deepEqual(parseArgs([]), {
    help: false,
    version: false,
    json: false,
    unknown: null,
    programIds: [],
  });
});

test('help and version flags, short and long', () => {
  assert.equal(parseArgs(['-h']).help, true);
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-v']).version, true);
  assert.equal(parseArgs(['--version']).version, true);
});

test('--json is a flag and can come before or after the program ID', () => {
  assert.equal(parseArgs(['--json']).json, true);
  assert.deepEqual(parseArgs(['--json', 'abc']).programIds, ['abc']);
  assert.deepEqual(parseArgs(['abc', '--json']).programIds, ['abc']);
  assert.equal(parseArgs(['abc', '--json']).json, true);
});

test('positional arguments are collected as program IDs', () => {
  assert.deepEqual(parseArgs(['abc', 'def']).programIds, ['abc', 'def']);
});

test('only the first unknown flag is reported', () => {
  const result = parseArgs(['--nope', '--also-nope', 'abc']);
  assert.equal(result.unknown, '--nope');
  assert.deepEqual(result.programIds, ['abc']);
});