'use strict';

/**
 * Split command-line arguments into flags and program IDs.
 * Only the first unknown flag is reported.
 */
function parseArgs(argv) {
  const result = {
    help: false,
    version: false,
    json: false,
    unknown: null,
    programIds: [],
  };

  for (const arg of argv) {
    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '-v' || arg === '--version') {
      result.version = true;
    } else if (arg === '--json') {
      result.json = true;
    } else if (arg.startsWith('-')) {
      if (result.unknown === null) result.unknown = arg;
    } else {
      result.programIds.push(arg);
    }
  }

  return result;
}

module.exports = { parseArgs };