# sol-program-info

Check if a Solana program is upgradeable, who controls it, and when it was last deployed.

Node 18+. Early scaffold: program ID validation and the RPC connection work, the on-chain lookup is coming.

## Usage

```bash
npx sol-program-info <program-id>
```

## Options

| Option | What it does |
| --- | --- |
| `-h`, `--help` | Show help |
| `-v`, `--version` | Show the version |

Results go to stdout, status messages go to stderr. Exit codes: `0` success, `1` invalid program ID or RPC endpoint setting, `2` bad usage.

## Use your own RPC

Public RPCs rate-limit heavily. Set your own endpoint:

```bash
export SOL_PROGRAM_INFO_RPC="https://your-rpc-endpoint"
```

Only the hostname is ever printed, never the full URL, so API keys stay out of your terminal output.

When the endpoint is busy, requests are retried with backoff and a `Retry-After` header is respected. A rejected API key (HTTP 401 or 403) or a wrong URL (HTTP 404) stops right away with a plain-English message instead of retrying.

## Roadmap

- [x] Program ID validation
- [x] RPC client with retries and clear errors
- [ ] Look up the program on-chain: upgradeable or immutable
- [ ] Upgrade authority, last deploy time and size
- [ ] `--json` and a plain-English verdict

## Development

```bash
npm test
```

## License

MIT