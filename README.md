# sol-program-info

Check if a Solana program is upgradeable, who controls it, and when it was last deployed.

Node 18+. Early scaffold: program ID validation works, the on-chain lookup is coming.

## Usage

```bash
npx sol-program-info <program-id>
```

## Options

| Option | What it does |
| --- | --- |
| `-h`, `--help` | Show help |
| `-v`, `--version` | Show the version |

Exit codes: `0` success, `1` invalid program ID, `2` bad usage.

## Roadmap

- [x] Program ID validation
- [ ] Look up the program on-chain: upgradeable or immutable
- [ ] Upgrade authority, last deploy time and size
- [ ] `--json`, clear errors and a plain-English verdict

## Development

```bash
npm test
```

## License

MIT