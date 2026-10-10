# Changelog

## 0.1.0

First release.

- Look up any Solana program ID and see which loader owns it: native, BPF Loader v1 or v2, or the Upgradeable BPF Loader. Loader v4 is recognized but not read yet
- For upgradeable programs: the upgrade authority, the slot and date of the last deploy, and the program size
- A plain-English verdict on the first line: upgradeable, frozen, immutable, built-in, closed or unknown
- `--json` prints one JSON object on stdout, safe to pipe to `jq`, with `canUpgrade` for scripts
- Only small slices of each account are requested (36 and 45 bytes), so lookups are cheap even for programs with megabytes of code
- Closed programs are reported as closed, and a missing deploy date (a pruned block) does not hide the rest of the result
- Requests retry with backoff on rate limits, server errors and network errors, and a `Retry-After` header is respected
- A rejected API key (HTTP 401 or 403) or a wrong URL (HTTP 404) stops at once with a plain-English message
- Only the endpoint hostname is ever printed, so API keys never reach your terminal
- Exit codes: `0` success, `1` invalid program ID or endpoint setting, `2` bad usage, `3` RPC lookup failed, `4` not a program
- Zero dependencies, Node 18 or newer