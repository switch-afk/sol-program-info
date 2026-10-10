'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { base58Decode } = require('../src/address');
const { base58Encode } = require('../src/base58');

const ADDRESSES = [
  '11111111111111111111111111111111',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'BPFLoaderUpgradeab1e11111111111111111111111',
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
];

test('real addresses survive a decode then encode round trip', () => {
  for (const address of ADDRESSES) {
    assert.equal(base58Encode(base58Decode(address)), address);
  }
});

test('32 zero bytes encode to 32 ones', () => {
  assert.equal(base58Encode(Buffer.alloc(32)), '1'.repeat(32));
});

test('leading zero bytes become leading ones', () => {
  assert.equal(base58Encode(Buffer.from([0, 0, 1])), '112');
});

test('empty input encodes to an empty string', () => {
  assert.equal(base58Encode(Buffer.alloc(0)), '');
});