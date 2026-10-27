# Flash

**Payments at the speed of a flash.**

[![Live site](https://img.shields.io/badge/live-flashpay.network-335fe4)](https://flashpay.network)
![Chain](https://img.shields.io/badge/chain-Solana-8462f4)

| | |
|---|---|
| Chain | Solana |
| Contract address | `pending` (will be published here and on the site the moment it is confirmed) |

## Overview

Flash is a payments brand for Solana. The site ships a live market board, a contract slot that stays inert until an address is confirmed, and a short plan for what comes next.

## Features

- Live Solana market board: top ten boosted tokens ranked by 24h volume, with price, 24h change, volume, liquidity and a copy button per address
- Ticker and pulse panel fed by the same data, refreshed every minute and paused while the tab is hidden
- Contract slot pinned to the top of every view, click to copy, inert until stated
- Social icons that stay visible at every width and only become links once the owner states them
- Motion with spring reveals, parallax depth and spotlight hover, all switched off for visitors who ask for reduced motion

## Links

- Site: https://flashpay.network
- X: pending
- GitHub: pending

## Build

```bash
npm install
npm run build   # writes dist/
npm run gates   # runs every check, exit 0 when all pass
```

`dist/` is the deploy folder.

## License

MIT, see [LICENSE](LICENSE).
