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

## How to read the ranking

Start at the top and work down, but do not treat the order as a countdown. The board answers one
question: if this protocol launched a token tomorrow, what would the market plausibly pay for it,
given what it pays for live protocols in the same line of work. A rank near the top means three
things line up at once: the protocol holds a lot of value, its sector trades richly against that
value, and it has run for a long time without issuing a token. Any one of those alone is not
enough, and the board will not rank a small protocol first just because its sector is hot, nor an
old one first just because it has waited longest.

The most useful way to use it is as a shortlist. Take the top dozen, open each protocol's own
site, and check three things the snapshot cannot tell you: that it still has no token, that it
runs a points or rewards program you can actually join, and that the position its farm plan asks
for is one you understand and can unwind. If any of those fails, move on to the next row. The
early rows below the watchlist floor are the same exercise with smaller numbers: they are where a
launch can surprise, and where the cost of being wrong is lowest, because the positions are
smaller.

The sector table ("Where the watchlist concentrates") is the other half of the read. When one
sector holds most of the forty and most of the combined value, the next launches are likely to
come from that sector, and a single protocol's rank matters less than the sector's weight. When
the value is spread evenly, the ranking itself carries more of the signal.

## Limitations

- **A launch is not promised.** Implied value is a valuation, not a forecast. A protocol can
  rank first for a year and never issue a token, and nothing in the snapshot says it will.
- **The snapshot is one day.** TVL, growth and the live comparables are all read from a single
  sealed date. A protocol that grew fast the week before, or one whose sector re-rated after the
  snapshot, will be scored on stale figures.
- **TVL is not revenue.** A protocol can hold a lot of value while earning little, and the market
  pays for earnings and growth, not for deposits alone. The category multiple captures some of
  that — sectors that earn more trade richer — but it is a sector average, not a read of any one
  protocol's books.
- **Thin sectors are noisy.** A category with one live protocol sets its multiple from that one
  name, shrunk toward the global median. The shrinkage keeps a single outlier from deciding the
  sector, but a thin sector's multiple is still the least reliable number on the board. The
  comparables table shows the comp count next to every multiple so you can see which ones to
  trust least.
- **The farm plans are generic by design.** They are derived from the protocol's category,
  chains, size and age, not from reading its docs. They tell you the shape of a position and
  what it costs, not the exact pool, vault or market to use. Always confirm the details on the
  protocol's own pages before depositing.

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

## Running on a new snapshot

The snapshot is a single day, and the board goes stale with it. To rebuild the radar from a
fresh DefiLlama pull, replace `input/snapshot.json` with the new file — same shape, same ten
fields per protocol, a new `as_of` date — and run `main.ts` again. Nothing else needs editing:
the category multiples, the growth and maturity multipliers, the watchlist coverage and the farm
plans are all recomputed from the new file on every run, so a protocol that launched a token
since the last snapshot drops out of the pre-token board and into the live set, a sector that
re-rated gets a new multiple, and a protocol that crossed the $50M floor moves from the early
radar onto the watchlist. Take new screenshots after a rebuild, because the dashboard's chart,
the sector table and the detail views all change with the data, and the dossier is rebuilt from
the output directory each time. If the new snapshot renames a category or adds a chain the
dashboard has never seen, the filters pick it up on their own — they are built from the rows,
not from a fixed list — but read the top of the new board once by eye, since a renamed category
can split one sector into two and halve both multiples.

## Verifying the output

Three checks, in order, before trusting a fresh build. First, read the line `main.ts` prints:
it names the protocol count, the watchlist size, the row count and the early/live split, and any
of those moving by more than a handful from the previous build means the input changed shape.
Second, open `out/board.json` and confirm the ranks run 1 to N with no gaps, the implied values
never rise as the rank falls, and every watchlist slug from the snapshot is present — `main.ts`
refuses to write a board that fails any of those, so a build that finishes has already passed
them, but the file is the record to keep. Third, open the dashboard, pick the top row, and read
its detail view: the page recomputes that row from the snapshot figures and says whether it
matches the number `board.json` carries, and the two must agree to the dollar. If they differ,
the data file the page loaded is not the board the program wrote — rebuild, and do not hand in a
mismatched pair.

## License

MIT. See `LICENSE`.
