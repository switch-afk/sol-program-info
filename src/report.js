'use strict';

const { formatAge } = require('./format');
const { LOADERS } = require('./loaders');

/** First and last four characters, e.g. Toke...Q5DA. */
function shortAddress(address) {
  if (address.length <= 11) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * The plain-English answer for a program that was found.
 * Returns { verdict, canUpgrade, summary }:
 *   verdict     upgradeable, frozen, immutable, built-in, closed or unknown
 *   canUpgrade  true, false, or null when this tool cannot tell
 *   summary     one sentence
 */
function describe(info, now = Date.now()) {
  if (info.kind === 'native') {
    return {
      verdict: 'built-in',
      canUpgrade: false,
      summary:
        'Built-in: part of the validator itself. Wallets cannot upgrade it; ' +
        'only a validator software release can.',
    };
  }

  if (info.kind === 'loader-v1' || info.kind === 'loader-v2') {
    return {
      verdict: 'immutable',
      canUpgrade: false,
      summary:
        'Immutable: this program uses an old loader with no upgrade mechanism, ' +
        'so its code can never change.',
    };
  }

  if (info.kind === 'upgradeable' && info.details) {
    const details = info.details;

    if (details.state === 'closed') {
      return {
        verdict: 'closed',
        canUpgrade: false,
        summary: "Closed: the program's ProgramData account no longer exists, so it cannot run.",
      };
    }

    if (!details.authority) {
      return {
        verdict: 'frozen',
        canUpgrade: false,
        summary:
          "Frozen: the upgrade authority was removed, so this program's code can never change.",
      };
    }

    let summary =
      `Upgradeable: whoever can sign as ${shortAddress(details.authority)} ` +
      "can replace this program's code at any time.";
    if (details.deployedAt !== null && details.deployedAt !== undefined) {
      summary += ` Last deployed ${formatAge(now - details.deployedAt * 1000)}.`;
    }
    return { verdict: 'upgradeable', canUpgrade: true, summary };
  }

  if (info.kind === 'loader-v4') {
    return {
      verdict: 'unknown',
      canUpgrade: null,
      summary: 'Loader v4: this version cannot tell who controls it yet.',
    };
  }

  return {
    verdict: 'unknown',
    canUpgrade: null,
    summary:
      'Unknown loader: this program is owned by a loader this tool does not recognize, ' +
      'so it cannot say whether the program can change.',
  };
}

/**
 * The result as a plain object, ready for JSON.stringify.
 * authority is null both for a frozen program and when it does not apply;
 * verdict tells them apart.
 */
function toJson(info, now = Date.now()) {
  const loader = LOADERS[info.owner];
  const details = info.details && info.details.state === 'ok' ? info.details : null;
  const { verdict, canUpgrade, summary } = describe(info, now);

  let lastDeployed = null;
  if (details) {
    const hasTime = details.deployedAt !== null && details.deployedAt !== undefined;
    lastDeployed = {
      slot: details.slot,
      time: hasTime ? new Date(details.deployedAt * 1000).toISOString() : null,
      timeNote: details.deployedNote || null,
    };
  }

  return {
    programId: info.programId,
    kind: info.kind,
    verdict,
    canUpgrade,
    summary,
    loader: { address: info.owner, name: loader ? loader.name : null },
    programData: info.programDataAddress,
    authority: details ? details.authority : null,
    lastDeployed,
    sizeBytes: details && details.sizeBytes !== undefined ? details.sizeBytes : null,
  };
}

module.exports = { describe, shortAddress, toJson };