# sol-program-info

Check if a Solana program is upgradeable, who controls it, and when it was last deployed.

Node 18+. Zero dependencies.

## Usage

```bash
npx sol-program-info <program-id>
```

The first line is the plain answer, followed by the details. This is the SPL Token program (output from October 2026):

```
Frozen: the upgrade authority was removed, so this program's code can never change.

Program:       TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
Type:          program
Loader:        Upgradeable BPF Loader (BPFLoaderUpgradeab1e11111111111111111111111)
ProgramData:   3gvYRKWyXRR9xKWe1ZjPhLY5ZJRN7KDB4rFZFGoJfFk2
Authority:     none; the upgrade authority was removed
Last deployed: slot 419,472,000, 2026-05-13 12:39 UTC (about 5 months ago)
Size:          108,600 bytes (106.1 KiB)
Upgrades:      never; the program is frozen
```

A program that can still be changed names who can change it. This is Jupiter v6, a few days after its last upgrade:

```
Upgradeable: whoever can sign as CvQZ...tipQ can replace this program's code at any time. Last deployed 2 days ago.

Program:       JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4
Type:          program
Loader:        Upgradeable BPF Loader (BPFLoaderUpgradeab1e11111111111111111111111)
ProgramData:   4Ec7ZxZS6Sbdg5UGSLHbAnM7GQHp2eFd4KYWRexAipQT
Authority:     CvQZZ23qYDWF2RUpxYJ8y9K4skmuvYEEjH7fK58jtipQ
Last deployed: slot 454,465,850, 2026-10-08 06:36 UTC (2 days ago)
Size:          2,892,224 bytes (2.76 MiB)
Upgrades:      yes, by whoever can sign as the upgrade authority
```

Built-in programs are simpler:

```
Built-in: part of the validator itself. Wallets cannot upgrade it; only a validator software release can.

Program:  11111111111111111111111111111111
Type:     built-in program
Loader:   Native loader (NativeLoader1111111111111111111111111111111)
Upgrades: only by a validator software release, not by any wallet
```

### Verdicts

| Verdict | Meaning |
| --- | --- |
| `upgradeable` | An upgrade authority is set. Whoever can sign as that address can replace the code at any time. |
| `frozen` | The upgrade authority was removed. The code can never change. |
| `immutable` | An old loader with no upgrade mechanism. The code can never change. |
| `built-in` | Part of the validator. Only a validator release can change it. |
| `closed` | The ProgramData account no longer exists, so the program cannot run. |
| `unknown` | A loader this version does not understand, so it cannot say. |

The authority can be one person's key or a multisig. The tool shows the address; it does not tell you which.

### What the rows mean

| Row | Meaning |
| --- | --- |
| `Authority` | The address that can replace the program's code. `none` means the authority was removed. |
| `Last deployed` | The slot of the last deploy or upgrade, and the time of that slot. Old blocks are sometimes pruned from RPCs, in which case the date is shown as unavailable with the reason. |
| `Size` | The program binary size. Left out when your RPC does not report the full account size. |
| `Upgrades` | The plain answer: can this program still change, and who can change it. |

Only small slices of each account are requested (36 and 45 bytes), so a lookup is cheap even for programs with megabytes of code.

## JSON output

```bash
npx sol-program-info --json <program-id> | jq .
```

stdout holds one JSON object and nothing else, so it is safe to pipe. Status messages and errors go to stderr. This is the System program:

```json
{
  "programId": "11111111111111111111111111111111",
  "kind": "native",
  "verdict": "built-in",
  "canUpgrade": false,
  "summary": "Built-in: part of the validator itself. Wallets cannot upgrade it; only a validator software release can.",
  "loader": {
    "address": "NativeLoader1111111111111111111111111111111",
    "name": "Native loader"
  },
  "programData": null,
  "authority": null,
  "lastDeployed": null,
  "sizeBytes": null
}
```

| Field | Meaning |
| --- | --- |
| `kind` | `upgradeable`, `loader-v1`, `loader-v2`, `loader-v4`, `native` or `unknown-loader` |
| `verdict` | One of the verdicts above |
| `canUpgrade` | `true`, `false`, or `null` when the tool cannot tell |
| `summary` | The one-line answer as a sentence |
| `loader` | The loader's address, and its name when it is recognized |
| `programData` | The ProgramData address, for upgradeable programs |
| `authority` | The upgrade authority, or `null` when frozen or not applicable (use `verdict` to tell which) |
| `lastDeployed` | `slot`, `time` (ISO 8601, or `null`) and `timeNote` (why there is no time), or `null` when not applicable |
| `sizeBytes` | The program binary size in bytes, or `null` when unknown |

A handy check for scripts: fail unless a program can never change.

```bash
test "$(npx sol-program-info --json <program-id> | jq -r .canUpgrade)" = "false"
```

### Loaders

| Loader | What it means |
| --- | --- |
| Native loader | Built into the validator. Changes only with a validator release. |
| BPF Loader v1, v2 | Old loaders with no upgrade mechanism. The program can never change. |
| Upgradeable BPF Loader | The program can be upgraded by its upgrade authority, if one is set. |
| Loader v4 | Recognized, but its details are not read yet. |

## Options

| Option | What it does |
| --- | --- |
| `--json` | Print the result as JSON instead of text |
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
- [x] `--json` and a plain-English verdict

## Development

```bash
npm test
```

## License

MIT