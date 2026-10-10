'use strict';

const { base58Encode } = require('./base58');
const { LOADERS, UPGRADEABLE_LOADER } = require('./loaders');
const { RpcError } = require('./rpc');

// The upgradeable loader's Program account is a 4 byte variant (2) followed
// by the 32 byte ProgramData address, 36 bytes in all.
const SLICE = { offset: 0, length: 36 };
const PROGRAM_VARIANT = 2;

// A ProgramData account starts with 45 bytes of metadata: a 4 byte variant (3),
// the 8 byte slot of the last deploy, a 1 byte flag for whether an upgrade
// authority is set, and the 32 byte authority address (zeros when there is none).
// The program binary follows. Only the metadata is requested, however large
// the program is.
const PROGRAM_DATA_SLICE = { offset: 0, length: 45 };
const METADATA_SIZE = 45;
const PROGRAM_DATA_VARIANT = 3;

/** The raw bytes of an account's data, or null if the RPC did not send base64. */
function decodeData(value) {
  const data = value && value.data;
  if (!Array.isArray(data) || typeof data[0] !== 'string') return null;
  return Buffer.from(data[0], 'base64');
}

/** getAccountInfo for the first bytes of an account. Resolves to the account, or null if it is missing. */
async function fetchAccount(rpc, address, slice) {
  const result = await rpc.call('getAccountInfo', [
    address,
    { encoding: 'base64', dataSlice: slice, commitment: 'confirmed' },
  ]);

  if (!result || typeof result !== 'object' || !('value' in result)) {
    throw new RpcError('the endpoint answer was not in the expected shape', 'bad-response');
  }
  return result.value;
}

/** The ProgramData address inside a Program account's data, or null. */
function readProgramDataAddress(bytes) {
  if (!bytes || bytes.length < 36) return null;
  if (bytes.readUInt32LE(0) !== PROGRAM_VARIANT) return null;
  return base58Encode(bytes.subarray(4, 36));
}

/** { slot, authority } from a ProgramData account's metadata, or null. authority is null when none is set. */
function readProgramDataHeader(bytes) {
  if (!bytes || bytes.length < METADATA_SIZE) return null;
  if (bytes.readUInt32LE(0) !== PROGRAM_DATA_VARIANT) return null;

  const slot = bytes.readBigUInt64LE(4);
  if (slot > BigInt(Number.MAX_SAFE_INTEGER)) return null;

  const flag = bytes[12];
  if (flag !== 0 && flag !== 1) return null;

  return {
    slot: Number(slot),
    authority: flag === 1 ? base58Encode(bytes.subarray(13, 45)) : null,
  };
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
  const base = { programId, owner: null, programDataAddress: null };
  const value = await fetchAccount(rpc, programId, SLICE);

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

/**
 * Read a ProgramData account. Resolves to one of
 *   { state: 'ok', slot, authority, sizeBytes }   authority is null when frozen;
 *                                                 sizeBytes is null when unknown
 *   { state: 'closed' }                           the account no longer exists
 *   { state: 'unreadable' }                       it is not in the expected format
 */
async function lookupProgramData(rpc, address) {
  const value = await fetchAccount(rpc, address, PROGRAM_DATA_SLICE);

  if (!value) return { state: 'closed' };

  const header = value.owner === UPGRADEABLE_LOADER ? readProgramDataHeader(decodeData(value)) : null;
  if (!header) return { state: 'unreadable' };

  // `space` is the account's full data size, even when only a slice was requested.
  const sizeBytes =
    Number.isSafeInteger(value.space) && value.space > METADATA_SIZE
      ? value.space - METADATA_SIZE
      : null;

  return { state: 'ok', slot: header.slot, authority: header.authority, sizeBytes };
}

/**
 * The time a slot was produced, as unix seconds. Never rejects with an RpcError:
 * old blocks are often pruned from RPCs, and a missing date should not hide
 * everything else, so the reason comes back in `note` instead.
 */
async function fetchDeployTime(rpc, slot) {
  try {
    const seconds = await rpc.call('getBlockTime', [slot]);
    if (Number.isSafeInteger(seconds)) return { deployedAt: seconds, note: null };
    return { deployedAt: null, note: 'the RPC no longer has that block' };
  } catch (error) {
    if (!(error instanceof RpcError)) throw error;
    return { deployedAt: null, note: error.message };
  }
}

/**
 * lookupProgram, plus the deploy details for upgradeable programs.
 *
 * For an upgradeable program the result also has
 *   details: { state: 'ok', slot, authority, sizeBytes, deployedAt, deployedNote }
 *         or { state: 'closed' }
 * and if the ProgramData account cannot be read, kind becomes 'unreadable'.
 * Rejects with RpcError when the RPC cannot be reached or answers oddly.
 */
async function inspectProgram(rpc, programId) {
  const info = await lookupProgram(rpc, programId);
  if (info.kind !== 'upgradeable') return info;

  const details = await lookupProgramData(rpc, info.programDataAddress);

  if (details.state === 'unreadable') return { ...info, kind: 'unreadable' };

  if (details.state === 'ok') {
    const time = await fetchDeployTime(rpc, details.slot);
    details.deployedAt = time.deployedAt;
    details.deployedNote = time.note;
  }

  return { ...info, details };
}

module.exports = {
  METADATA_SIZE,
  PROGRAM_DATA_SLICE,
  SLICE,
  inspectProgram,
  lookupProgram,
  lookupProgramData,
  readProgramDataAddress,
  readProgramDataHeader,
};