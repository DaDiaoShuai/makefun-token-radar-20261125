# makefun-token-radar-20261125

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/DaDiaoShuai/makefun-token-radar-20261125/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/DaDiaoShuai/makefun-token-radar-20261125/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar — a dashboard that ranks pre-token protocols by implied value and shows how to farm each one. It reads one sealed snapshot of the protocol universe, scores every rankable protocol with no token on record, and writes a ranked board, a filterable dashboard, and a farm plan per protocol.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22 or later, standard library only, no network. `main.ts` reads the snapshot, writes `out/board.json` (198 ranked rows), `out/data.js`, copies `dashboard/` and `screenshots/` to `out/`, and writes `out/dossier.json`.

## The model (radar-2)

Implied value follows only from the snapshot's own figures — TVL, seven-day growth, how long the protocol has run with no token on record, and how many chains it runs on. No protocol name is special-cased:

```
implied = round( tvl_usd x 0.30
  x (1 + clamp(change_7d, -60, 120) / 100 x 0.6)
  x (0.6 + min(age_days, 1095) / 1095 x 0.4)
  x breadth x velocity x relative )
```

- **Breadth** is 1 + 0.03 per extra chain, up to 5 extra chains: a protocol live on more chains is distributed more widely.
- **Velocity** is 1.10 when seven-day growth tops 25% and the protocol is under two years old: young and fast-growing is the early signal this radar is for.
- **Relative** is 1 + clamp(growth − category median, −30, 60) / 100 × 0.3: a protocol growing faster than its own category earns a premium, one lagging its peers pays for it. The median is computed from the snapshot itself, per category, over the protocols the board ranks; a category with fewer than 3 protocols reporting growth scores a neutral 1.
- **Age** is the time since the protocol was first listed; an unlisted age uses 365 days.

The board covers all 40 watchlist protocols plus 158 early pre-token protocols below the $50M floor — every rankable pre-token protocol in the snapshot. Wrapped, staked and bridged products of tokens that already trade are kept out of the ranking, and the 24 largest live-token protocols are set aside in their own view with their market caps shown. Each row carries a seven-step farm plan with costs and times, derived from the protocol's category, chains, TVL and age.

## Model notes

The model is radar-2, the second iteration of the entry's own scoring. Radar-1 multiplied TVL by growth, maturity and breadth. Radar-2 adds three ideas that the first version missed:

- **Relative momentum.** A protocol is compared with its own category's median seven-day growth. A 20% rise means little in a category that is all rising 25%; it means a lot in one that is flat. Categories with fewer than three protocols reporting growth stay neutral.
- **Velocity.** A young protocol growing fast is a different signal from an old one growing fast: under two years old and above 25% growth earns a 10% premium.
- **The full early set.** Radar-1 ranked only the watchlist's rule as written. Radar-2 ranks every pre-token protocol that passes the same exclusion rule, so a protocol below the $50M floor can show up on its own merit.

What has not changed: the value is derived only from the snapshot's own figures — TVL, seven-day growth, time running with no token on record, chains and category. No protocol name is special-cased, and no figure comes from outside the snapshot.

## Limitations

- The snapshot is frozen at 2026-11-14. A protocol that has launched a token since then, or one that has since been hacked or shut down, still appears as it was.
- The snapshot records no token, and this entry never claims a token is coming. A protocol can run for years with no token at all.
- Farm plans are a starting point, not a walkthrough: they name the action, the cost and the time, but the reader still has to do the work and check the contract.
- Implied value is the entry's own claim. It is not a price, not a forecast and not advice.

## Files

- `main.ts` — the entry point: reads the snapshot, writes the board, the dashboard data and the dossier.
- `lib/model.ts` — the radar-2 model, the farm plans and the per-protocol notes.
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js`. No network, no framework.
- `screenshots/` — the three screenshots of the dashboard: the board, a detail view, a filtered view.
- `vendor/makefun-board.ts` — the make.fun dossier library, shipped byte for byte as the kit provides it.

`dashboard/` is a static page with no network: a board ranked by implied value with value tiers (S/A/B/C) and a top-three strip, a fastest-movers strip, a detail view per protocol with its multiplier breakdown, farm plan and notes on its record, and filters by search, category, chain, minimum TVL and watchlist-only, plus a live-token tab. The page recomputes each row's implied value from the snapshot figures and checks it against the number `board.json` carries.

## How to read the board

- **Rank** is the model's claim: rank 1 is the strongest implied value. **Tiers** group it: S is the top 10, A the next 40, B the next 100, C the rest.
- **Fastest movers** are the five quickest growers over seven days, whatever their rank: a small protocol moving fast is the early find, and its rank says whether the value has caught up yet.
- **Relative** compares a protocol with its own category's median growth: above the median earns a premium, below it pays for it.
- **Farm plans** are seven steps with costs and times, derived from the protocol's category, chains, TVL and age. **Notes** read the protocol's record back in plain language: single-chain concentration, sharp growth or decline, a very young or very old listing, and size above $1B.

---

<sub>Entered on [make.fun](https://make.fun/?ref=rc00v3zj&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
