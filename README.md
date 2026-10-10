# sol-program-info

Check if a Solana program is upgradeable, who controls it, and when it was last deployed.

Node 18+. Early release: the program lookup works, the upgrade authority and deploy time are coming.

## Usage

```bash
npx sol-program-info <program-id>
```

Example:

```
Program:  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
Type:     program
Loader:   BPF Loader v2 (BPFLoader2111111111111111111111111111111111)
Upgrades: never; this loader has no upgrade mechanism
```

The tool reads the program account and checks which loader owns it:

| Loader | What it means |
| --- | --- |
| Native loader | Built into the validator. Changes only with a validator release. |
| BPF Loader v1, v2 | Old loaders with no upgrade mechanism. The program can never change. |
| Upgradeable BPF Loader | The program can be upgraded by its upgrade authority. The ProgramData address is shown. |
| Loader v4 | Recognized, but its details are not read yet. |

Only the first 36 bytes of the account are requested, so a lookup is cheap even for programs with megabytes of code.

## Options

| Option | What it does |
| --- | --- |
| `-h`, `--help` | Show help |
| `-v`, `--version` | Show the version |

Results go to stdout, status messages go to stderr.

Exit codes:

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Invalid program ID or RPC endpoint setting |
| `2` | Bad usage |
| `3` | The RPC lookup failed |
| `4` | The address is not a program (missing, or a wallet or data account) |

## Use your own RPC

Public RPCs rate-limit heavily. Set your own endpoint:

```bash
export SOL_PROGRAM_INFO_RPC="https://your-rpc-endpoint"
```

By default the tool reads mainnet. If you point it at devnet or a local validator through this variable, it reads that network instead.

Only the hostname is ever printed, never the full URL, so API keys stay out of your terminal output.

When the endpoint is busy, requests are retried with backoff and a `Retry-After` header is respected. A rejected API key (HTTP 401 or 403) or a wrong URL (HTTP 404) stops right away with a plain-English message instead of retrying.

## Roadmap

- [x] Program ID validation
- [x] RPC client with retries and clear errors
- [x] Look up the program on-chain: loader and ProgramData address
- [ ] Upgrade authority, last deploy time and size
- [ ] `--json` and a plain-English verdict

## Development

```bash
npm test
```

## License

MIT