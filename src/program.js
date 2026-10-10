'use strict';

const { base58Encode } = require('./base58');
const { LOADERS } = require('./loaders');
const { RpcError } = require('./rpc');

// The upgradeable loader's Program account is a 4 byte variant (2) followed
// by the 32 byte ProgramData address, 36 bytes in all. Nothing else is needed,
// so only that much is requested, however large the program is.
const SLICE = { offset: 0, length: 36 };
const PROGRAM_VARIANT = 2;

/** The raw bytes of an account's data, or null if the RPC did not send base64. */
function decodeData(value) {
  const data = value && value.data;
  if (!Array.isArray(data) || typeof data[0] !== 'string') return null;
  return Buffer.from(data[0], 'base64');
}

/** The ProgramData address inside a Program account's data, or null. */
function readProgramDataAddress(bytes) {
  if (!bytes || bytes.length < 36) return null;
  if (bytes.readUInt32LE(0) !== PROGRAM_VARIANT) return null;
  return base58Encode(bytes.subarray(4, 36));
}

/**
 * Look up an address on-chain and work out what kind of program it is.
 *
 * Resolves to { programId, kind, owner, programDataAddress } where kind is
 *   not-found, not-a-program, native, loader-v1, loader-v2, upgradeable,
 *   loader-v4, unknown-loader or unreadable.
 * programDataAddress is set only for upgradeable programs.
 * Rejects with RpcError when the RPC cannot be reached or answers oddly.
 */
async function lookupProgram(rpc, programId) {
  const result = await rpc.call('getAccountInfo', [
    programId,
    { encoding: 'base64', dataSlice: SLICE, commitment: 'confirmed' },
  ]);

  if (!result || typeof result !== 'object' || !('value' in result)) {
    throw new RpcError('the endpoint answer was not in the expected shape', 'bad-response');
  }

  const base = { programId, owner: null, programDataAddress: null };
  const value = result.value;

  if (!value) return { ...base, kind: 'not-found' };

  const owner = value.owner;
  if (!value.executable) return { ...base, kind: 'not-a-program', owner };

  const loader = LOADERS[owner];
  if (!loader) return { ...base, kind: 'unknown-loader', owner };

  if (loader.kind !== 'upgradeable') return { ...base, kind: loader.kind, owner };

  const address = readProgramDataAddress(decodeData(value));
  if (!address) return { ...base, kind: 'unreadable', owner };

  return { ...base, kind: 'upgradeable', owner, programDataAddress: address };
}

module.exports = { SLICE, lookupProgram, readProgramDataAddress };