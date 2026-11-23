// The token radar's launch odds (radar-4): the chance a pre-token protocol
// ever issues a token, read off the peers' own record — not asserted, and
// not a second valuation. radar-3 ranked by implied value alone and said in
// its own limitations that a launch is not promised; a protocol can rank
// first for a year and never issue a token. The odds close that hole with the
// snapshot's own history: among the 758 protocols the snapshot tracks, 54.9%
// already have a token, and the rate is not flat — it runs 29.4% for
// protocols listed under 180 days ago and 77.7% for protocols over three
// years old, 75.9% for Lending and 21.4% for Risk Curators, 60.8% above
// $250M of TVL and 52.1% in the $10–50M band. A row's odds are the mean of
// its three smoothed rates (category, TVL band, age band), each shrunk toward
// the base rate with 10 phantom protocols so a thin band cannot swing on a
// handful of names.
//
// The odds are validated, not just fitted: they rank the has-token label
// with AUC 0.799 on the full snapshot and 0.742 / 0.759 on the two held-out
// split halves (rates fitted on one half, scored on the other), so the
// number survives contact with protocols it never saw. The board keeps
// ranking by implied value — the gate's stated key — and the odds feed the
// expected value (implied x odds, shown per row) and the farm verdicts: a
// farmer sizes a position on the launch that may come, so capacity is 5% of
// the EXPECTED value at $100 of profit per farmer, not of the implied value.
// That is why Strong falls from 27 rows to 15: the launches least likely to
// happen no longer count as if they were certain.

import type { SnapshotProtocol } from './model.ts';

/** The three smoothed rates behind one row's odds, so the dashboard can show the breakdown. */
export interface OddsBreakdown {
  /** Mean of the three rates below: the row's launch odds. */
  odds: number;
  category_rate: number;
  tvl_rate: number;
  age_rate: number;
}

/** The odds model: the base rate and one smoothed rate per category, TVL band and age band. */
export interface OddsModel {
  /** Share of all snapshot protocols that already have a token. */
  base_rate: number;
  /** Phantom protocols at the base rate each smoothed rate carries. */
  strength: number;
  category_rates: Map<string, number>;
  tvl_rates: Map<string, number>;
  age_rates: Map<string, number>;
}

/** The odds validation: AUC on the full snapshot and on both held-out halves. */
export interface OddsValidation {
  auc_full: number;
  auc_split_a: number;
  auc_split_b: number;
  /** Protocols scored in each split half. */
  split_n: [number, number];
}

export const ODDS_STRENGTH = 10;

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / 86_400_000));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The TVL band a protocol sits in. */
export function tvlBand(tvlUsd: number): string {
  if (tvlUsd < 1_000_000) return '<$1M';
  if (tvlUsd < 10_000_000) return '$1-10M';
  if (tvlUsd < 50_000_000) return '$10-50M';
  if (tvlUsd < 250_000_000) return '$50-250M';
  return '>=$250M';
}

/** The age band a protocol sits in. */
export function ageBand(asOf: string, listedAt: string | null): string {
  const age = ageDays(asOf, listedAt);
  if (age === null) return 'unknown';
  if (age < 180) return '<180d';
  if (age < 365) return '180-365d';
  if (age < 1095) return '1-3y';
  return '>3y';
}

/** One band's smoothed token rate: (tokens + strength x base) / (n + strength). */
function smoothRates(
  protocols: SnapshotProtocol[],
  keyOf: (p: SnapshotProtocol) => string,
  base: number,
  strength: number,
): Map<string, number> {
  const counts = new Map<string, { n: number; tokens: number }>();
  for (const p of protocols) {
    const key = keyOf(p);
    const entry = counts.get(key) ?? { n: 0, tokens: 0 };
    entry.n += 1;
    if (!isPreToken(p)) entry.tokens += 1;
    counts.set(key, entry);
  }
  const out = new Map<string, number>();
  for (const [key, entry] of counts) {
    out.set(key, round4((entry.tokens + strength * base) / (entry.n + strength)));
  }
  return out;
}

/** Fit the odds model on a set of protocols: base rate plus the three smoothed rate tables. */
export function fitOdds(protocols: SnapshotProtocol[], asOf: string, strength: number = ODDS_STRENGTH): OddsModel {
  const tokens = protocols.filter((p) => !isPreToken(p)).length;
  const base = protocols.length > 0 ? tokens / protocols.length : 0.5;
  return {
    base_rate: round4(base),
    strength,
    category_rates: smoothRates(protocols, (p) => p.category ?? 'Other', base, strength),
    tvl_rates: smoothRates(protocols, (p) => tvlBand(p.tvl_usd), base, strength),
    age_rates: smoothRates(protocols, (p) => ageBand(asOf, p.listed_at), base, strength),
  };
}

/** One protocol's launch odds from a fitted model, with the three rates behind it. */
export function tokenOdds(p: SnapshotProtocol, asOf: string, model: OddsModel): OddsBreakdown {
  const categoryRate = model.category_rates.get(p.category ?? 'Other') ?? model.base_rate;
  const tvlRate = model.tvl_rates.get(tvlBand(p.tvl_usd)) ?? model.base_rate;
  const ageRate = model.age_rates.get(ageBand(asOf, p.listed_at)) ?? model.base_rate;
  return {
    odds: round3((categoryRate + tvlRate + ageRate) / 3),
    category_rate: categoryRate,
    tvl_rate: tvlRate,
    age_rate: ageRate,
  };
}

/** Mann-Whitney AUC for the has-token label: how well `score` ranks protocols
 *  that already have a token above protocols that do not. */
function auc(protocols: SnapshotProtocol[], score: (p: SnapshotProtocol) => number): number {
  const pos = protocols.filter((p) => !isPreToken(p)).map(score);
  const neg = protocols.filter((p) => isPreToken(p)).map(score);
  if (pos.length === 0 || neg.length === 0) return 0.5;
  let wins = 0;
  let ties = 0;
  for (const a of pos) {
    for (const b of neg) {
      if (a > b) wins += 1;
      else if (a === b) ties += 1;
    }
  }
  return round4((wins + 0.5 * ties) / (pos.length * neg.length));
}

/**
 * Validate the odds: AUC on the full snapshot, then on two held-out halves —
 * rates fitted on one slug-ordered half, scored on the other, and back —
 * so the number is measured on protocols the rates never saw.
 */
export function validateOdds(protocols: SnapshotProtocol[], asOf: string): OddsValidation {
  const full = fitOdds(protocols, asOf);
  const aucFull = auc(protocols, (p) => tokenOdds(p, asOf, full).odds);
  const bySlug = [...protocols].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const halfA = bySlug.filter((_, i) => i % 2 === 0);
  const halfB = bySlug.filter((_, i) => i % 2 === 1);
  const modelA = fitOdds(halfA, asOf);
  const modelB = fitOdds(halfB, asOf);
  return {
    auc_full: aucFull,
    auc_split_a: auc(halfB, (p) => tokenOdds(p, asOf, modelA).odds),
    auc_split_b: auc(halfA, (p) => tokenOdds(p, asOf, modelB).odds),
    split_n: [halfA.length, halfB.length],
  };
}
