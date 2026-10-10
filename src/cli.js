'use strict';

const pkg = require('../package.json');
const { AddressError, validateProgramId } = require('./address');
const { parseArgs } = require('./args');
const { EndpointError, RPC_ENV, rateLimitHint, resolveEndpoint } = require('./endpoint');
const { explainProblem, formatProgram } = require('./format');
const { lookupProgram } = require('./program');
const { RpcError, createRpcClient } = require('./rpc');

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
  3  the RPC lookup failed
  4  the address is not a program
`;

// Problems that end the run without a result block.
const PROBLEM_EXIT = {
  'not-found': 4,
  'not-a-program': 4,
  unreadable: 3,
};

/**
 * Run the CLI. Returns an exit code instead of exiting, so it can be tested.
 * Tests pass io.rpcOptions (fetch, sleep, attempts) to avoid the network.
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

  // Shown once per run, however many times the endpoint throttles us.
  let hintShown = false;
  const showRateLimitHint = () => {
    if (hintShown) return;
    hintShown = true;
    stderr.write(`${rateLimitHint(endpoint)}\n`);
  };

  const rpc = createRpcClient({
    url: endpoint.rpcUrl,
    onRetry: ({ delayMs, error }) => {
      stderr.write(
        `Request failed: ${error.message}. Retrying in ${(delayMs / 1000).toFixed(1)}s...\n`
      );
      if (error.rateLimited) showRateLimitHint();
    },
    ...io.rpcOptions,
  });

  let info;
  try {
    info = await lookupProgram(rpc, programId);
  } catch (error) {
    if (!(error instanceof RpcError)) throw error;
    stderr.write(`Could not look up the program on ${endpoint.host}: ${error.message}\n`);
    if (error.rateLimited) showRateLimitHint();
    return 3;
  }

  const problemExit = PROBLEM_EXIT[info.kind];
  if (problemExit) {
    stderr.write(`${explainProblem(info, endpoint.host)}\n`);
    return problemExit;
  }

  stdout.write(formatProgram(info));
  return 0;
}

module.exports = { run, HELP };