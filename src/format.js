'use strict';

const { LOADERS, SYSTEM_PROGRAM, UPGRADEABLE_LOADER } = require('./loaders');

const DAY_MS = 24 * 60 * 60 * 1000;

/** Aligned "Label:  value" lines. */
function rows(pairs) {
  const width = Math.max(...pairs.map(([label]) => label.length)) + 2;
  return pairs.map(([label, value]) => `${`${label}:`.padEnd(width)}${value}`).join('\n');
}

/** 134567 -> "134,567" */
function withCommas(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 134567 -> "134,567 bytes (131.4 KiB)" */
function formatBytes(n) {
  return `${withCommas(n)} bytes (${(n / 1024).toFixed(1)} KiB)`;
}

/** How long ago, in words, for a duration in milliseconds. */
function formatAge(ms) {
  const days = Math.floor(ms / DAY_MS);
  if (days < 1) return 'today';
  if (days < 2) return '1 day ago';
  if (days < 60) return `${days} days ago`;
  if (days < 730) return `about ${Math.round(days / 30.44)} months ago`;
  return `about ${Math.floor(days / 365.25)} years ago`;
}

/** "slot 250,000,000, 2025-10-09 08:53 UTC (about 12 months ago)" */
function formatDeployed(details, now) {
  const slot = `slot ${withCommas(details.slot)}`;

  if (details.deployedAt === null || details.deployedAt === undefined) {
    const why = details.deployedNote ? `: ${details.deployedNote}` : '';
    return `${slot}, date unavailable${why}`;
  }

  const iso = new Date(details.deployedAt * 1000).toISOString();
  const when = `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
  return `${slot}, ${when} (${formatAge(now - details.deployedAt * 1000)})`;
}

/** The rows that describe an upgradeable program's ProgramData account. */
function upgradeableRows(details, now) {
  if (details.state === 'closed') {
    return [
      ['Status', 'closed; its ProgramData account no longer exists, so it cannot run'],
      ['Upgrades', 'not applicable; the program is closed'],
    ];
  }

  const pairs = [
    ['Authority', details.authority || 'none; the upgrade authority was removed'],
    ['Last deployed', formatDeployed(details, now)],
  ];
  if (details.sizeBytes !== null && details.sizeBytes !== undefined) {
    pairs.push(['Size', formatBytes(details.sizeBytes)]);
  }
  pairs.push([
    'Upgrades',
    details.authority
      ? 'yes, by whoever can sign as the upgrade authority'
      : 'never; the program is frozen',
  ]);
  return pairs;
}

/** The result block for an address that is a program. Ends with a newline. */
function formatProgram(info, now = Date.now()) {
  const loader = LOADERS[info.owner];
  const pairs = [['Program', info.programId]];

  if (loader) {
    pairs.push(['Type', loader.type]);
    pairs.push(['Loader', `${loader.name} (${info.owner})`]);
    if (info.programDataAddress) pairs.push(['ProgramData', info.programDataAddress]);

    if (info.details) {
      pairs.push(...upgradeableRows(info.details, now));
    } else {
      pairs.push(['Upgrades', loader.upgrades]);
    }
  } else {
    pairs.push(['Type', 'program']);
    pairs.push(['Owner', `${info.owner} (loader not recognized)`]);
    pairs.push(['Upgrades', 'unknown; this loader is not recognized']);
  }

  return `${rows(pairs)}\n`;
}

/** Plain-English explanation for an address that is not a usable program. */
function explainProblem(info, host) {
  switch (info.kind) {
    case 'not-found':
      return (
        `No account found at ${info.programId} on ${host}. Check the program ID, ` +
        'and that your RPC points at the right network (mainnet by default).'
      );
    case 'not-a-program':
      if (info.owner === SYSTEM_PROGRAM) {
        return `${info.programId} is a wallet (a system account), not a program.`;
      }
      if (info.owner === UPGRADEABLE_LOADER) {
        return (
          `${info.programId} is a program data or buffer account, not a program. ` +
          "Use the program's own ID instead."
        );
      }
      return (
        `${info.programId} exists on ${host} but is not an executable program ` +
        `(it is owned by ${info.owner}).`
      );
    case 'unreadable':
      return (
        `${info.programId} is owned by the upgradeable loader, ` +
        'but its data is not in the expected format.'
      );
    default:
      return '';
  }
}

module.exports = { explainProblem, formatAge, formatBytes, formatProgram, withCommas };