# sol-program-info

Check if a Solana program is upgradeable, who controls it, and when it was last deployed.

Node 18+. Early release: the program lookup, upgrade authority, deploy date and size work. `--json` and a plain-English verdict are coming.

## Usage

```bash
npx sol-program-info <program-id>
```

For a program on the Upgradeable BPF Loader, which covers most programs on Solana, it shows who can upgrade it, when it was last deployed and how big it is. The values below are illustrative:

```
Program:       JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4
Type:          program
Loader:        Upgradeable BPF Loader (BPFLoaderUpgradeab1e11111111111111111111111)
ProgramData:   4Ec7ZxZS6Sbdg5UGSLHbAnM7GQHp2eFd4KYWRexAipQT
Authority:     <upgrade authority address>
Last deployed: slot 250,000,000, 2025-10-09 08:53 UTC (about 12 months ago)
Size:          134,567 bytes (131.4 KiB)
Upgrades:      yes, by whoever can sign as the upgrade authority
```

Built-in programs are simpler:

```
Program:  11111111111111111111111111111111
Type:     built-in program
Loader:   Native loader (NativeLoader1111111111111111111111111111111)
Upgrades: only by a validator software release, not by any wallet
```

### What the rows mean

| Row | Meaning |
| --- | --- |
| `Authority` | The address that can replace the program's code. `none` means the authority was removed and the program is frozen for good. |
| `Last deployed` | The slot of the last deploy or upgrade, and the time of that slot. Old blocks are sometimes pruned from RPCs, in which case the date is shown as unavailable with the reason. |
| `Size` | The program binary size. Left out when your RPC does not report the full account size. |
| `Upgrades` | The plain answer: can this program still change, and who can change it. |

A closed program, whose ProgramData account no longer exists, is reported as closed.

### Loaders

| Loader | What it means |
| --- | --- |
| Native loader | Built into the validator. Changes only with a validator release. |
| BPF Loader v1, v2 | Old loaders with no upgrade mechanism. The program can never change. |
| Upgradeable BPF Loader | The program can be upgraded by its upgrade authority, if one is set. |
| Loader v4 | Recognized, but its details are not read yet. |

Only small slices of each account are requested (36 and 45 bytes), so a lookup is cheap even for programs with megabytes of code.

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
- [x] Upgrade authority, last deploy time and size
- [ ] `--json` and a plain-English verdict

## Development

```bash
npm test
```

## License

MIT