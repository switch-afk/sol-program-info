'use strict';

const { ALPHABET } = require('./address');

/** Encode bytes as base58. Leading zero bytes become leading "1" characters. */
function base58Encode(bytes) {
  const buffer = Buffer.from(bytes);

  let n = 0n;
  for (const byte of buffer) n = n * 256n + BigInt(byte);

  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }

  for (const byte of buffer) {
    if (byte !== 0) break;
    out = `1${out}`;
  }

  return out;
}

module.exports = { base58Encode };