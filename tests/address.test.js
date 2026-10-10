'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AddressError, ALPHABET, base58Decode, validateProgramId } = require('../src/address');

function base58Encode(bytes) {
  let n = BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`);
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = `1${out}`;
  }
  return out;
}

const KNOWN_PROGRAMS = [
  '11111111111111111111111111111111',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'BPFLoaderUpgradeab1e11111111111111111111111',
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
];

test('known program IDs are accepted', () => {
  for (const id of KNOWN_PROGRAMS) {
    assert.equal(validateProgramId(id), id);
  }
});

test('surrounding whitespace is trimmed', () => {
  assert.equal(validateProgramId(`  ${KNOWN_PROGRAMS[1]}\n`), KNOWN_PROGRAMS[1]);
});

test('empty and non-string input is rejected', () => {
  for (const input of ['', '   ', undefined, null, 42]) {
    assert.throws(() => validateProgramId(input), AddressError);
  }
});

test('characters outside base58 are rejected with their position', () => {
  assert.throws(() => validateProgramId('0000'), /character "0" at position 1/);
  assert.throws(() => validateProgramId('abcO'), /character "O" at position 4/);
});

test('the wrong length is rejected and the real length is reported', () => {
  const short = base58Encode(Buffer.alloc(16, 7));
  assert.throws(() => validateProgramId(short), /decodes to 16 bytes/);

  const long = base58Encode(Buffer.alloc(33, 7));
  assert.throws(() => validateProgramId(long), /decodes to 33 bytes/);
});

test('a 64-byte value is called out as a transaction signature', () => {
  const signature = base58Encode(Buffer.alloc(64, 1));
  assert.throws(() => validateProgramId(signature), /transaction signature/);
});

test('base58Decode keeps leading zero bytes', () => {
  assert.equal(base58Decode('1112').length, 4);
  assert.equal(base58Decode('11111111111111111111111111111111').length, 32);
});