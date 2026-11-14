# Token Radar

A token launch radar: a ranked board of the pre-token protocols most worth watching, from a sealed
snapshot of every protocol DefiLlama tracks, with a web dashboard that shows the board, a detail view
for each protocol, and the steps to farm it.

Built for the make.fun competition **token-radar-01** ("Build the best token launch radar").

## What it does

The snapshot covers 758 protocols. The radar:

1. **Takes the watchlist as the floor** — the 40 protocols with at least $50M of TVL and no token on
   record (no market cap, no CoinGecko id, no symbol).
2. **Adds the early radar** — 160 pre-token protocols below the $50M floor, by TVL, so the board
   surfaces the launches the watchlist misses.
3. **Ranks them by implied value** — what a token launch would be worth, computed from the
   snapshot's own figures, never from a hand-written list of names.
4. **Sets the live-token protocols aside** — the 24 largest by market cap, shown with the market's
   own values, never mixed into the pre-token ranking.

## The model (radar-2)

Implied value is one function of the snapshot figures. The base multiple is not a flat number: it
is the market's own valuation of the protocol's sector, read off the live protocols in the same
category.

```
comp(category) = (n × median(mcap/TVL of live protocols in the category)
                  + 5 × globalMedian) / (n + 5), clamped to [0.05×, 1.5×]
base           = tvl_usd × comp(category)
growthMult     = 1 + clamp(change_7d, -60, 120) / 100 × 0.5
maturityMult   = 0.6 + min(age_days, 1095) / 1095 × 0.4   (age unknown: 365 days)
implied        = max(1, round(base × growthMult × maturityMult))
```

- **Category comparables.** For each category, the median market-cap-to-TVL ratio of its live
  protocols, shrunk toward the global median (0.214×) with 5 phantom protocols so a category with
  one or two live comps cannot swing on a single outlier, then clamped to 0.05×–1.5×. A category
  with no live comps takes the global median. The dashboard's comparables table lists every
  category's multiple, its live comp count, and its raw median, so the sector pricing is checkable
  at a glance.
- **Growth.** Seven-day TVL change, clamped to −60%…+120%, worth half its weight.
- **Maturity.** Longer with no token means a longer track record and a more mature launch; worth
  0.6×–1.0×.
- **No name is special-cased.** The same function scores every row, and the multiples are
  recomputed from the snapshot on every run. The dashboard recomputes each row from the snapshot
  figures and shows whether it matches the number `board.json` carries.

Each protocol also gets a **farm plan**: six steps derived from its own record (category, chains,
TVL, age), each with a cost and a time — what to do, what it costs, how long to hold. No slogans.

## The dashboard

`dashboard/` is a static page that renders with no network: `index.html`, `app.css`, `app.js`, plus
`data.js` (written by `main.ts` from the same board). It has:

- A **sortable, filterable board** — search, category filter, chain filter, a watchlist-only toggle,
  and Pre-token / Live token tabs. Watchlist rows carry a gold badge.
- A **top-10 chart** — the strongest implied values as an inline SVG bar chart (gold = watchlist,
  teal = early row).
- A **detail view** per protocol — the model broken down (TVL, growth, age, category multiple,
  multipliers, implied value) with the recompute check, plus the farm plan.
- The **model panel** — the formula in full and the comparables table.

## Run it

Node 22+, standard library only. No dependencies, no network at run time.

```sh
# From the repo root, with a snapshot at ../input/snapshot.json:
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

# Then open the dashboard:
open out/dashboard/index.html
```

`main.ts` writes `out/board.json` (the ranked board), `out/data.js` (the dashboard's dataset),
`out/dashboard/` (the static page), `out/screenshots/` (the three screenshots), and
`out/dossier.json` (the summary the judge reads, built with the vendored `vendor/makefun-board.ts`).

## Layout

```
main.ts                  The program: snapshot in, board + dashboard + dossier out
lib/model.ts             The radar-2 model: comparables, implied value, farm plans
vendor/makefun-board.ts  The vendored make.fun dossier library (keep as-is)
dashboard/               The static page: index.html, app.css, app.js
screenshots/             The three screenshots: board, detail, filtered
```

## License

MIT. See `LICENSE`.
