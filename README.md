[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/DaDiaoShuai/makefun-token-radar-20261125/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/DaDiaoShuai/makefun-token-radar-20261125/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar — pre-token protocols, ranked by implied value

Which protocol deserves a token next? This entry reads the sealed DefiLlama snapshot, ranks every protocol that **records no token** by an implied value, and gives each one a concrete farm plan.

## The value model

A pre-token protocol is worth what the market already pays for the same kind of protocol that does have a token. The sector multiple is **measured from the snapshot itself**: the median market-cap / TVL of the live-token protocols in the same category (at least five peers, otherwise the whole live set's median), clamped to 0.05–0.60 so one tiny-TVL outlier cannot set the price.

```
implied value = TVL × sector multiple × growth × maturity × breadth
```

- **Sector multiple** — median live mcap/TVL of the category, clamped 0.05–0.60
- **Growth** — 1 + 0.6 × 7-day TVL change, change clamped to −50%…+150%
- **Maturity** — 0.75 + 0.25 × min(age, 730 days) / 730; unknown listing date scores 0.85
- **Breadth** — 1 + 0.04 per extra chain, up to 5 extra chains (max 1.20×)

No protocol name is ever special-cased: the same function scores every row.

## Coverage

The board ranks all 40 watchlist protocols, plus every other rankable pre-token protocol below the $50M floor, found by TVL — 226 rows in total. Protocols above the floor that the house's own screen left out (wrapped, staked, bridged, versioned or exchange products) are not re-ranked: the snapshot's screen already settled them. Live-token protocols are never ranked; they appear apart, at the market's own value, as the peer set the multiples are measured from.

## Farm plans

Every row carries a 7-step farm plan derived from that protocol's own record — category, chains, TVL and age — with a cost and a time for each step: fresh wallet, the category's core action with a capital tier, a weekly cadence, a minimum hold, a monthly points check, a never-pay-to-claim warning, and a log-and-unwind close.

## The dashboard

A static page with no network: a sortable, filterable board (search, category, chain, watchlist-only, sort by implied value / TVL / growth / age), a detail view for every protocol with the full model breakdown, a live-token comparison view, and a model page that shows every sector multiple and the methodology. The URL hash carries the view, so a link opens the same board, detail or filter a screenshot shows.

## Run it

Node 22, standard library only, no install:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

`main.ts` reads the snapshot, writes `board.json` and `data.js` to the output directory, copies `dashboard/` and `screenshots/` there, and writes `dossier.json` with the vendored `vendor/makefun-board.ts`.

## Read this before you farm

A protocol on this board records no token in the snapshot. That is a record, not a promise: it may still have a token the record does not carry, and it may never issue one. Implied value is this entry's claim from the snapshot's own figures, never a prediction of a launch, a price, or an airdrop. Farming costs gas and locks capital; never pay anyone to claim.

## License

MIT — see `LICENSE`.
