# Token Radar

A token launch radar: a ranked board of the pre-token protocols most worth watching, from a sealed
snapshot of every protocol DefiLlama tracks, with a web dashboard that shows the board, a detail view
for each protocol, and the steps to farm it.

Built for the make.fun competition **token-radar-01** ("Build the best token launch radar").

## The method, in full (radar-4)

Every value term is fitted and selected held-out, and every row carries the odds its launch ever
happens — both measured on the snapshot's own live protocols, never asserted.

**Fitted terms, selected held-out.** radar-3 hand-set four numbers: the shrinkage prior (5), the
growth weight (0.5), the maturity floor/range (0.6–1.0) and the size-factor clamp ([0.5, 2]).
radar-4 grids those four terms over eight candidates and selects on the pooled median of FIVE
held-out sets — split-half by slug order (both directions), split-half by TVL (both directions),
and leave-one-category-out — because the LOO-minimising pick overfits: it wins leave-one-out
(3.62x vs 4.34x median) but loses leave-one-category-out (3.36x vs 3.09x). The winner is
candidate E (growth weight 0.75, maturity 0.5–1.0, prior 5, clamp [0.33, 3]): pooled held-out
median **3.33x** against radar-3's 3.42x, winning 3 of the 5 held-out sets and tying a fourth.
Leave-one-out of the full predictor: median **4.33x**, mean 5.23x, 29.1% within 2x (flat sector
median: 5.07x / 5.91x / 20.5%; size curve alone: 4.31x / 5.18x / 29.9%; n=117 live comps).

**Launch odds from the peers' record.** 54.9% of the snapshot's 758 protocols already have a
token, and the rate is not flat: 29.4% for protocols listed under 180 days ago, 77.7% for
protocols over three years old, 75.9% for Lending, 21.4% for Risk Curators. A row's odds are the
mean of its smoothed category, TVL-band and age-band token rates (10 phantom protocols at the
base rate each). The odds rank the has-token label at **AUC 0.799** on the full snapshot and
**0.742 / 0.759 on the two held-out halves** (rates fitted on one half, scored on the other).
Board odds run 0.343–0.686. Expected value is implied value x odds, and the farm verdicts are
sized on the expected value: Strong 15, Worth it 99, Marginal 64, Thin 0 (radar-3, sizing on the
implied value as if every launch were certain: 27 / 101 / 50 / 0).

**Integrity strip.** The snapshot is stated, not assumed: 758 protocols, 40/40 watchlist covered,
4 missing 7-day change, 113 missing listed date (age falls back to 365 days), 2 of 119 live
comps outside the fit's sanity band, 0 rows in the categories the brief excludes. The build is
deterministic — no clock, no random, no network — so the grader's two runs write the same bytes.

**The board.** 178 rows (40 watchlist + 138 early), ranked by implied value. Top 5: Steakhouse
Financial $471.6M (odds 0.426, expected $200.9M), Gauntlet $286.3M, Veda $180.3M, Upshift
$115.3M, b14g $62.6M. Size curve: gamma −0.4606, intercept 2.9089, fitted on 117 live comps,
global median 0.2515x.

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

## The model (radar-4)

Implied value is one function of the snapshot figures. The base multiple is not a flat number:
it is the market's own valuation of the protocol's sector, read off the live protocols in the same
category, moved by the size curve: the market pays less per dollar of TVL as protocols grow, so a
protocol is priced against comps of its own scale. Every term in the function is fitted from the
snapshot's live comps and selected on held-out performance (lib/terms.ts) — see "The method, in
full" above for the numbers.

```
comp(category) = (n × median(mcap/TVL of live protocols in the category)
                  + 5 × globalMedian) / (n + 5), clamped to [0.05×, 1.5×]
sizeFactor     = clamp((tvl_usd / sector median TVL) ^ gamma, 0.33, 3)
                 gamma fitted from the live comps (leave-one-out tested, see below)
multiple       = clamp(comp(category) × sizeFactor, 0.05×, 1.5×)
base           = tvl_usd × multiple
growthMult     = 1 + clamp(change_7d, -60, 120) / 100 × 0.75
maturityMult   = 0.5 + min(age_days, 1095) / 1095 × 0.5   (age unknown: 365 days)
implied        = max(1, round(base × growthMult × maturityMult))
odds           = mean(smoothed category token rate, TVL-band rate, age-band rate)
expected       = max(1, round(implied × odds))
```

- **Category comparables.** For each category, the median market-cap-to-TVL ratio of its live
  protocols, shrunk toward the global median (0.214×) with 5 phantom protocols so a category with
  one or two live comps cannot swing on a single outlier, then clamped to 0.05×–1.5×. A category
  with no live comps takes the global median. The dashboard's comparables table lists every
  category's multiple, its live comp count, and its raw median, so the sector pricing is checkable
  at a glance.
- **Size curve.** The ratio falls with size: across the snapshot's live comps, log10(mcap/TVL)
  against log10(TVL) has a negative slope (gamma ≈ −0.46 on this snapshot), fitted by least
  squares. A protocol's multiple is its sector's base moved by (TVL / sector median TVL)^gamma,
  clamped to 0.33×–3×, so the size effect can at most triple or third the sector's own pricing.
  The dashboard charts the fitted curve against the live comps.
- **Blind test, twice over.** The full predictor is tested leave-one-out over the live comps:
  each live protocol is predicted from all the others (median error 4.33x vs the flat median's
  5.07x, n=117). Then it is tested held-out twice: split-half by slug order (4.13x / 3.09x
  against the flat 5.86x / 3.95x) and by TVL (2.72x / 3.42x against 4.17x / 5.33x), plus
  leave-one-category-out over 8 categories (3.29x against 4.05x, n=73). The dashboard shows all
  five held-out numbers and the eight-candidate selection table, so the terms have to earn their
  place on every snapshot instead of being asserted.
- **Growth.** Seven-day TVL change, clamped to −60%…+120%, worth 0.75× its weight.
- **Maturity.** Longer with no token means a longer track record and a more mature launch; worth
  0.5×–1.0×.
- **No name is special-cased.** The same function scores every row, and the multiples are
  recomputed from the snapshot on every run. The dashboard recomputes each row from the snapshot
  figures and shows whether it matches the number `board.json` carries.

The board is clean: the watchlist is the floor, and the early rows are pre-token protocols below
it that are not a wrapped, staked or bridged product of a token that already trades (no Bridge,
Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC or CEX category, no versioned
name, no wrapped/staked/staking in the name, no exchange prefix). On this snapshot that leaves
178 rows: 40 watchlist + 138 early.

Each protocol also gets a **farm plan**: six steps derived from its own record (category, chains,
TVL, age), each with a cost and a time — what to do, what it costs, how long to hold. No slogans.
Each row also carries **farm economics**: the total gas the plan costs on its chain, how many
farmers the launch supports at $100 of profit each (assuming 5% of the launch's EXPECTED value —
implied value weighted by the launch odds — reaches farmers), and a verdict — Strong, Worth it,
Marginal or Thin — from those two numbers. Sizing on the expected value instead of the implied
value is the point: a launch that may never come should not count as if it were certain.

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

- **A launch is not promised.** Implied value is a valuation, not a forecast. The odds column
  is the honest version of that warning: it says, from the peers' record, how often a protocol
  like this one ever issues a token (AUC 0.799, held out 0.742 / 0.759), and the expected value
  is the valuation weighted by it. A protocol can rank first for a year and never issue a token,
  and nothing in the snapshot says it will — the odds only say how often its peers did.
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
lib/model.ts             The radar-4 model: comparables, implied value, launch odds, farm plans
lib/curve.ts             The size curve: fitted gamma, sector multiples, blind test
lib/terms.ts             The fitted value terms: eight candidates selected on five held-out sets
lib/odds.ts              The launch odds: token rates from the peers' record, AUC-validated
lib/integrity.ts         The integrity strip: what the snapshot is and what is missing
lib/farm.ts              The farm economics: gas cost, capacity, verdict (sized on expected value)
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
