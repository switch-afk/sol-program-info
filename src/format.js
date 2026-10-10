'use strict';

const { LOADERS, SYSTEM_PROGRAM, UPGRADEABLE_LOADER } = require('./loaders');

/** Aligned "Label:  value" lines. */
function rows(pairs) {
  const width = Math.max(...pairs.map(([label]) => label.length)) + 2;
  return pairs.map(([label, value]) => `${`${label}:`.padEnd(width)}${value}`).join('\n');
}

/** The result block for an address that is a program. Ends with a newline. */
function formatProgram(info) {
  const loader = LOADERS[info.owner];
  const pairs = [['Program', info.programId]];

  if (loader) {
    pairs.push(['Type', loader.type]);
    pairs.push(['Loader', `${loader.name} (${info.owner})`]);
    if (info.programDataAddress) pairs.push(['ProgramData', info.programDataAddress]);
    pairs.push(['Upgrades', loader.upgrades]);
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

module.exports = { explainProblem, formatProgram };