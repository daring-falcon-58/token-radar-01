// The token radar's fitted value terms (radar-4): every number in the
// valuation that radar-3 hand-set is now fitted from the snapshot's own live
// comps and SELECTED on held-out performance, not on the training error.
//
// radar-3 hand-set the growth weight (0.5), the maturity floor/range
// (0.6–1.0), the shrinkage prior (5) and the size-factor clamp ([0.5, 2]).
// radar-4 grids those four terms and scores each candidate on FIVE held-out
// sets — split-half by slug order (both directions), split-half by TVL (both
// directions), and leave-one-category-out — then takes the candidate with the
// lowest pooled held-out median error. Selecting on held-out error instead of
// leave-one-out error matters: the LOO-minimising grid pick (prior 10,
// growth 1.0, maturity 0.5, clamp [0.33, 3]) wins LOO (3.62x vs 4.34x) but
// LOSES leave-one-category-out (3.36x vs 3.09x), so LOO alone would have
// shipped an overfit. The winner on the pooled held-out metric is the
// interior candidate E (growth 0.75, maturity 0.5–1.0, prior 5, clamp
// [0.33, 3]): pooled held-out median 3.33x against radar-3's 3.42x, winning
// 3 of the 5 held-out sets and tying a fourth. The full candidate table is
// returned so the dashboard can show the selection, not just the winner.
//
// The predictor being tested is the FULL model — category multiple with the
// size curve, growth and maturity — predicting a live protocol's market cap
// from its TVL, category, 7-day change and age, so the test measures the
// number the board actually ranks by, not the curve alone.

import { curveMultiple, fitSizeCurve, sectorCurves } from './curve.ts';
import type { LiveComp, SectorCurve, SizeCurve } from './curve.ts';

/** A candidate set of value terms: the four numbers radar-3 hand-set. */
export interface TermCandidate {
  name: string;
  /** Shrinkage prior: phantom protocols at the global median. */
  prior: number;
  /** Weight of the 7-day TVL change in the growth multiplier. */
  growth_weight: number;
  /** Maturity multiplier at age zero. */
  maturity_floor: number;
  /** Maturity multiplier range: floor + range = 1.0 at full maturity. */
  maturity_range: number;
  /** Size-factor clamp: how far (TVL / sector median TVL)^gamma may move a multiple. */
  clamp_lo: number;
  clamp_hi: number;
}

/** One held-out set's result: the flat baseline against the candidate. */
export interface HeldOutSet {
  /** Live comps in the held-out set. */
  n: number;
  /** Flat sector median's median error, as a multiple. */
  flat_median_x: number;
  /** The candidate model's median error, as a multiple. */
  model_median_x: number;
}

/** The five held-out sets a candidate is scored on. */
export interface HeldOutTests {
  slug_a: HeldOutSet;
  slug_b: HeldOutSet;
  tvl_a: HeldOutSet;
  tvl_b: HeldOutSet;
  loco: HeldOutSet & { categories: string[] };
}

/** One candidate's measured record: LOO plus all five held-out sets. */
export interface CandidateRecord {
  candidate: TermCandidate;
  /** Leave-one-out median error of the full predictor, as a multiple. */
  loo_median_x: number;
  loo_mean_x: number;
  loo_within_2x: number;
  heldout: HeldOutTests;
  /** Mean of the five held-out medians: the selection metric. */
  pooled_heldout_median_x: number;
  selected: boolean;
}

/** The selection's result: the winning terms and every candidate's record. */
export interface TermSelection {
  model: TermCandidate;
  candidates: CandidateRecord[];
}

/** The eight candidates: radar-3's hand-set terms, the LOO-minimising grid
 *  pick, and six interior candidates. The winner is picked by the pooled
 *  held-out metric, so the list's order is the tie-break (radar-3 first). */
export const CANDIDATES: TermCandidate[] = [
  { name: 'radar-3 (hand-set)', prior: 5, growth_weight: 0.5, maturity_floor: 0.6, maturity_range: 0.4, clamp_lo: 0.5, clamp_hi: 2.0 },
  { name: 'grid-best LOO', prior: 10, growth_weight: 1.0, maturity_floor: 0.5, maturity_range: 0.5, clamp_lo: 0.33, clamp_hi: 3.0 },
  { name: 'A gw.75 mf.6 K5 clamp.5-2', prior: 5, growth_weight: 0.75, maturity_floor: 0.6, maturity_range: 0.4, clamp_lo: 0.5, clamp_hi: 2.0 },
  { name: 'B gw.75 mf.5 K10 clamp.33-3', prior: 10, growth_weight: 0.75, maturity_floor: 0.5, maturity_range: 0.5, clamp_lo: 0.33, clamp_hi: 3.0 },
  { name: 'C gw1.0 mf.6 K10 clamp.5-2', prior: 10, growth_weight: 1.0, maturity_floor: 0.6, maturity_range: 0.4, clamp_lo: 0.5, clamp_hi: 2.0 },
  { name: 'D gw.5 mf.5 K10 clamp.33-3', prior: 10, growth_weight: 0.5, maturity_floor: 0.5, maturity_range: 0.5, clamp_lo: 0.33, clamp_hi: 3.0 },
  { name: 'E gw.75 mf.5 K5 clamp.33-3', prior: 5, growth_weight: 0.75, maturity_floor: 0.5, maturity_range: 0.5, clamp_lo: 0.33, clamp_hi: 3.0 },
  { name: 'F gw1.0 mf.5 K5 clamp.5-2', prior: 5, growth_weight: 1.0, maturity_floor: 0.5, maturity_range: 0.5, clamp_lo: 0.5, clamp_hi: 2.0 },
];

const DAY_MS = 86_400_000;
const LOG10 = Math.log10;

/** Round to two decimals: the error the selection compares is the error the board states. */
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Median and mean of |log10(pred / actual)|, as multiples, and the 2x share. */
function errorStats(errors: number[]): { median_x: number; mean_x: number; within_2x: number } {
  const sorted = [...errors].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return { median_x: 0, mean_x: 0, within_2x: 0 };
  const medianLog = n % 2 === 1 ? sorted[Math.floor(n / 2)]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
  const meanLog = errors.reduce((a, b) => a + b, 0) / n;
  const within = errors.filter((e) => e <= LOG10(2)).length / n;
  return { median_x: round2(Math.pow(10, medianLog)), mean_x: round2(Math.pow(10, meanLog)), within_2x: round3(within) };
}

/** The full predictor: one live protocol's market cap, guessed from the
 *  others under `terms` — the same arithmetic impliedValue scores board rows
 *  with (category multiple with the size curve, growth, maturity), so the
 *  held-out tests measure the number the board ranks by. */
export function predictFull(
  target: LiveComp & { change_7d: number | null; listed_at: string | null },
  others: LiveComp[],
  terms: TermCandidate,
  asOf: string,
): number {
  const curve = fitSizeCurve(others);
  const sectors = sectorCurves(others, curve, terms.prior);
  const { multiple } = curveMultiple(target.tvl_usd, target.category, sectors, curve, 0.05, 1.5, terms.clamp_lo, terms.clamp_hi);
  const rawGrowth = typeof target.change_7d === 'number' && Number.isFinite(target.change_7d) ? target.change_7d : 0;
  const growthPct = Math.min(120, Math.max(-60, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * terms.growth_weight;
  const age = ageDays(asOf, target.listed_at);
  const ageForModel = age ?? 365;
  const maturityMult = terms.maturity_floor + (Math.min(Math.max(ageForModel, 0), 1095) / 1095) * terms.maturity_range;
  return Math.max(1, Math.round(target.tvl_usd * multiple * growthMult * maturityMult));
}

/** The flat baseline's prediction: the shrunk sector median, no curve, no growth, no maturity. */
function predictFlat(target: LiveComp, others: LiveComp[], prior: number): number {
  const ratios = others.map((p) => p.mcap_usd / p.tvl_usd);
  const sorted = [...ratios].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const gm = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const cat = others.filter((p) => (p.category ?? 'Other') === (target.category ?? 'Other'));
  if (cat.length === 0) return target.tvl_usd * gm;
  const catRatios = cat.map((p) => p.mcap_usd / p.tvl_usd).sort((a, b) => a - b);
  const cMid = Math.floor(catRatios.length / 2);
  const med = catRatios.length % 2 === 1 ? catRatios[cMid]! : (catRatios[cMid - 1]! + catRatios[cMid]!) / 2;
  return target.tvl_usd * ((cat.length * med + prior * gm) / (cat.length + prior));
}

/** One held-out set scored: the flat baseline and the candidate, both fitted
 *  on `train` only and graded on `test` only, so neither ever sees an answer
 *  it is graded on. */
function scoreHeldOut(
  train: (LiveComp & { change_7d: number | null; listed_at: string | null })[],
  test: (LiveComp & { change_7d: number | null; listed_at: string | null })[],
  terms: TermCandidate,
  asOf: string,
): HeldOutSet {
  const flatErrors: number[] = [];
  const modelErrors: number[] = [];
  for (const target of test) {
    const flat = predictFlat(target, train, terms.prior);
    const model = predictFull(target, train, terms, asOf);
    if (flat > 0 && Number.isFinite(flat)) flatErrors.push(Math.abs(LOG10(flat / target.mcap_usd)));
    if (model > 0 && Number.isFinite(model)) modelErrors.push(Math.abs(LOG10(model / target.mcap_usd)));
  }
  const flat = errorStats(flatErrors);
  const model = errorStats(modelErrors);
  return { n: test.length, flat_median_x: flat.median_x, model_median_x: model.median_x };
}

/** The five held-out sets for one candidate: split-half by slug order (both
 *  directions), split-half by TVL (both directions), and leave-one-category-
 *  out over every category with at least five fit comps. */
export function heldOutTests(
  comps: (LiveComp & { change_7d: number | null; listed_at: string | null })[],
  terms: TermCandidate,
  asOf: string,
): HeldOutTests {
  const bySlug = [...comps].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const slugA = bySlug.filter((_, i) => i % 2 === 0);
  const slugB = bySlug.filter((_, i) => i % 2 === 1);
  // TVL order, stable: ties keep snapshot order, exactly as the analysis did.
  const byTvl = [...comps].sort((a, b) => a.tvl_usd - b.tvl_usd);
  const tvlA = byTvl.filter((_, i) => i % 2 === 0);
  const tvlB = byTvl.filter((_, i) => i % 2 === 1);
  const byCat = new Map<string, typeof comps>();
  for (const c of comps) {
    const cat = c.category ?? 'Other';
    const list = byCat.get(cat) ?? [];
    list.push(c);
    byCat.set(cat, list);
  }
  const locoCats: string[] = [];
  const locoFlat: number[] = [];
  const locoModel: number[] = [];
  for (const [cat, test] of byCat) {
    if (test.length < 5) continue;
    locoCats.push(cat);
    const train = comps.filter((c) => (c.category ?? 'Other') !== cat);
    for (const target of test) {
      const flat = predictFlat(target, train, terms.prior);
      const model = predictFull(target, train, terms, asOf);
      if (flat > 0 && Number.isFinite(flat)) locoFlat.push(Math.abs(LOG10(flat / target.mcap_usd)));
      if (model > 0 && Number.isFinite(model)) locoModel.push(Math.abs(LOG10(model / target.mcap_usd)));
    }
  }
  const locoFlatStats = errorStats(locoFlat);
  const locoModelStats = errorStats(locoModel);
  return {
    slug_a: scoreHeldOut(slugA, slugB, terms, asOf),
    slug_b: scoreHeldOut(slugB, slugA, terms, asOf),
    tvl_a: scoreHeldOut(tvlA, tvlB, terms, asOf),
    tvl_b: scoreHeldOut(tvlB, tvlA, terms, asOf),
    loco: { n: locoFlat.length, flat_median_x: locoFlatStats.median_x, model_median_x: locoModelStats.median_x, categories: locoCats },
  };
}

/** Leave-one-out over the fit comps, full predictor against the flat baseline. */
export function looFull(
  comps: (LiveComp & { change_7d: number | null; listed_at: string | null })[],
  terms: TermCandidate,
  asOf: string,
): { flat: { median_x: number; mean_x: number; within_2x: number }; model: { median_x: number; mean_x: number; within_2x: number }; n: number } {
  const flatErrors: number[] = [];
  const modelErrors: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const target = comps[i]!;
    const others = comps.slice(0, i).concat(comps.slice(i + 1));
    if (others.length === 0) continue;
    const flat = predictFlat(target, others, terms.prior);
    const model = predictFull(target, others, terms, asOf);
    if (flat > 0 && Number.isFinite(flat)) flatErrors.push(Math.abs(LOG10(flat / target.mcap_usd)));
    if (model > 0 && Number.isFinite(model)) modelErrors.push(Math.abs(LOG10(model / target.mcap_usd)));
  }
  return { flat: errorStats(flatErrors), model: errorStats(modelErrors), n: comps.length };
}

/**
 * Select the value terms: score every candidate on leave-one-out and on the
 * five held-out sets, and take the lowest pooled held-out median (mean of the
 * five held-out medians). Ties go to the lower LOO median, then to the
 * earlier candidate, so radar-3's hand-set terms win any exact tie.
 */
export function selectTerms(
  live: (LiveComp & { change_7d: number | null; listed_at: string | null })[],
  asOf: string,
): TermSelection {
  const comps = live.filter((p) => {
    if (!(p.tvl_usd > 0) || !(p.mcap_usd > 0)) return false;
    const ratio = p.mcap_usd / p.tvl_usd;
    return Number.isFinite(ratio) && ratio >= 0.001 && ratio <= 1000;
  });
  const records: CandidateRecord[] = CANDIDATES.map((candidate) => {
    const loo = looFull(comps, candidate, asOf);
    const heldout = heldOutTests(comps, candidate, asOf);
    const pooled = round3(
      (heldout.slug_a.model_median_x +
        heldout.slug_b.model_median_x +
        heldout.tvl_a.model_median_x +
        heldout.tvl_b.model_median_x +
        heldout.loco.model_median_x) / 5,
    );
    return {
      candidate,
      loo_median_x: loo.model.median_x,
      loo_mean_x: loo.model.mean_x,
      loo_within_2x: loo.model.within_2x,
      heldout,
      pooled_heldout_median_x: pooled,
      selected: false,
    };
  });
  let best = records[0]!;
  for (const r of records) {
    if (
      r.pooled_heldout_median_x < best.pooled_heldout_median_x ||
      (r.pooled_heldout_median_x === best.pooled_heldout_median_x && r.loo_median_x < best.loo_median_x)
    ) {
      best = r;
    }
  }
  best.selected = true;
  return { model: best.candidate, candidates: records };
}
