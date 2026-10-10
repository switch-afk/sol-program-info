# Contributing

Thanks for helping out. This is a small zero-dependency CLI, so the process is short.

## Setup

You need Node 18 or newer.

```bash
git clone https://github.com/switch-afk/sol-program-info.git
cd sol-program-info
npm test
```

There is nothing to install: the tool has no dependencies. Tests use the built-in `node --test` runner.

Tests never touch the network. The RPC is replaced with a fake `fetch` from `tests/helpers/mock-rpc.js`, so the whole suite runs offline. Use that helper for any new test that needs an RPC answer.

## Trying it against a real program

Set your own RPC endpoint first. Public RPCs rate-limit heavily.

```bash
export SOL_PROGRAM_INFO_RPC="https://your-rpc-endpoint"
node bin/sol-program-info.js <program-id>
```

Never paste an RPC URL with a key into an issue or a pull request. The tool only prints the hostname for this reason, so keep it that way.

## Making a change

1. Open an issue first for anything bigger than a small fix, so we agree on the idea.
2. Create a branch from `main`.
3. Keep the change focused: one feature or fix per pull request.
4. Add or update tests. New behavior without a test will be asked for one.
5. Update the README if behavior or output changes, and add a line under the next version in `CHANGELOG.md`.
6. Open the pull request and wait for the Tests check to pass on Node 18, 20 and 22.

## Code style

- Plain CommonJS, no build step, and no new dependencies unless there is a strong reason.
- Error messages are written for people. Say what went wrong and what to do about it.
- Error messages, output and logs must never include the full endpoint URL.
- Be honest about what the tool cannot tell. An address that cannot be read is reported as unknown, never guessed.

## Ideas that would help

- Support for Loader v4 accounts
- Tests against more unusual account layouts

## Reporting a bug

Please include your Node version, the program ID, the command you ran, and the status messages from stderr. Use the endpoint hostname only, never the full URL.