'use strict';

const pkg = require('../package.json');
const { AddressError, validateProgramId } = require('./address');
const { parseArgs } = require('./args');
const { EndpointError, RPC_ENV, resolveEndpoint } = require('./endpoint');

const HELP = `sol-program-info v${pkg.version}

Check if a Solana program is upgradeable, who controls it, and when it was
last deployed.

Usage:
  sol-program-info [options] <program-id>

Options:
  -h, --help       Show this help
  -v, --version    Show the version

Environment:
  ${RPC_ENV}   Your own RPC endpoint (recommended; public RPCs
                           rate-limit heavily)

Output:
  Results go to stdout, status messages go to stderr.

Exit codes:
  0  success
  1  invalid program ID or RPC endpoint setting
  2  bad usage
`;

/**
 * Run the CLI. Returns an exit code instead of exiting, so it can be tested.
 */
async function run(argv, io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const env = io.env || process.env;

  const args = parseArgs(argv);

  if (args.help) {
    stdout.write(HELP);
    return 0;
  }

  if (args.version) {
    stdout.write(`${pkg.version}\n`);
    return 0;
  }

  if (args.unknown) {
    stderr.write(`Unknown option: ${args.unknown}\n\n${HELP}`);
    return 2;
  }

  if (args.programIds.length === 0) {
    stderr.write(`Expected a program ID.\n\n${HELP}`);
    return 2;
  }

  if (args.programIds.length > 1) {
    stderr.write(`Expected one program ID, got ${args.programIds.length}.\n\n${HELP}`);
    return 2;
  }

  const raw = args.programIds[0];
  let programId;
  try {
    programId = validateProgramId(raw);
  } catch (error) {
    if (!(error instanceof AddressError)) throw error;
    stderr.write(`Not a valid program ID (${raw}): ${error.message}\n`);
    return 1;
  }

  let endpoint;
  try {
    endpoint = resolveEndpoint(env);
  } catch (error) {
    if (!(error instanceof EndpointError)) throw error;
    stderr.write(`${error.message}\n`);
    return 1;
  }

  stderr.write(`Using ${endpoint.host}.\n`);
  stdout.write(`${programId} is a valid program ID. Program lookup is not built yet.\n`);
  return 0;
}

module.exports = { run, HELP };