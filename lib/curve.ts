// The token radar's size curve (radar-3): the market's valuation of a protocol
// is not a flat multiple of its TVL. Across the live protocols that already
// trade, the market-cap-to-TVL ratio falls as TVL grows: a small protocol
// trades at several times its TVL, a very large one at a fraction of it.
// radar-2 priced every protocol in a sector at that sector's median ratio,
// which overvalues the largest protocols and undervalues the small ones.
// radar-3 fits the size effect from the snapshot's own live comps and
// anchors each sector's multiple at that sector's own size, so a protocol
// is priced against comps of its own scale, not against the whole sector.
//
//   ratio(TVL) ~ TVL^gamma, gamma fitted by least squares on log10(ratio)
//   against log10(TVL) over the live comps (gamma is negative: the ratio
//   falls with size). A sector's base multiple is its median ratio, shrunk
//   toward the global median exactly as radar-2 did, and the multiple a
//   protocol gets is that base, moved by the size factor
//   (TVL / sector median TVL)^gamma, clamped to [0.5, 2] so no protocol is
//   priced more than twice or less than half its sector's own multiple.
//
// The fit is tested blind: leave-one-out over the live comps, each protocol
// predicted from all the others, once with the flat sector median and once
// with the curve. The dashboard shows both error rates, so the curve has
// to earn its place on every snapshot instead of being asserted.

/** A live protocol the curve is fitted from: it trades, so its ratio is a fact. */
export interface LiveComp {
  slug: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
}

/** The fitted size curve: one exponent for the whole market. */
export interface SizeCurve {
  /** log10(ratio) = intercept + gamma * log10(TVL). Gamma is negative. */
  gamma: number;
  intercept: number;
  /** Live comps that entered the fit (after the sanity band). */
  comps: number;
  /** Live protocols left out of the fit by the sanity band. */
  excluded: number;
  /** Global median mcap/TVL over the fit set (the shrinkage prior). */
  global_median: number;
  /** Median TVL over the fit set, for reference. */
  median_tvl: number;
}

/** One sector's anchored multiple: its median ratio and its own size anchor. */
export interface SectorCurve {
  category: string;
  /** The sector's base multiple: median ratio, shrunk toward the global median. */
  multiple: number;
  /** Live comps in this sector with a usable ratio. */
  comps: number;
  /** The raw median ratio before shrinkage (null when there are no comps). */
  median: number | null;
  /** Median TVL of the sector's comps: the size the base multiple is anchored at. */
  ref_tvl: number;
}

/** The blind test: leave-one-out error of the flat median against the curve. */
export interface CurveBacktest {
  /** Live comps the test ran over. */
  n: number;
  /** Flat sector median: median |predicted / actual| as a multiple. */
  flat_median_x: number;
  /** Flat sector median: mean |predicted / actual| as a multiple. */
  flat_mean_x: number;
  /** Flat sector median: share of predictions within 2x of the actual. */
  flat_within_2x: number;
  /** Size curve: median |predicted / actual| as a multiple. */
  curve_median_x: number;
  /** Size curve: mean |predicted / actual| as a multiple. */
  curve_mean_x: number;
  /** Size curve: share of predictions within 2x of the actual. */
  curve_within_2x: number;
}

/** A scatter point for the dashboard's curve chart: raw TVL and market cap. */
export interface CurvePoint {
  tvl_usd: number;
  mcap_usd: number;
}

const LOG10 = Math.log10;

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A ratio is usable when it is a real market fact, not a data error: a token
 *  worth a thousand times its protocol's TVL, or a thousandth of it, is a
 *  stale market cap or a near-zero TVL, and it would bend the fit. */
export function isFitComp(p: LiveComp): boolean {
  if (!(p.tvl_usd > 0) || !(p.mcap_usd > 0)) return false;
  const ratio = p.mcap_usd / p.tvl_usd;
  return Number.isFinite(ratio) && ratio >= 0.001 && ratio <= 1000;
}

/** The live comps the fit may use, in snapshot order. */
export function fitComps(live: LiveComp[]): LiveComp[] {
  return live.filter(isFitComp);
}

/**
 * The size curve, fitted from the live comps: least squares of log10(ratio)
 * on log10(TVL). Returns the exponent, the intercept, and the counts, so the
 * dashboard can state what was fitted and on how many comps.
 */
export function fitSizeCurve(live: LiveComp[]): SizeCurve {
  const comps = fitComps(live);
  const excluded = live.length - comps.length;
  if (comps.length === 0) {
    return { gamma: 0, intercept: 0, comps: 0, excluded, global_median: 0.25, median_tvl: 0 };
  }
  const xs = comps.map((p) => LOG10(p.tvl_usd));
  const ys = comps.map((p) => LOG10(p.mcap_usd / p.tvl_usd));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  const gamma = sxx > 0 ? sxy / sxx : 0;
  const intercept = my - gamma * mx;
  return {
    gamma: Math.round(gamma * 1e4) / 1e4,
    intercept: Math.round(intercept * 1e4) / 1e4,
    comps: comps.length,
    excluded,
    global_median: Math.round(median(comps.map((p) => p.mcap_usd / p.tvl_usd)) * 1e4) / 1e4,
    median_tvl: median(comps.map((p) => p.tvl_usd)),
  };
}

/**
 * Each sector's anchored multiple: its median ratio, shrunk toward the global
 * median with `prior` phantom protocols, and the median TVL of its comps,
 * the size the multiple is anchored at. A sector with no comps takes the
 * global median, anchored at the market's median TVL.
 */
export function sectorCurves(
  live: LiveComp[],
  curve: SizeCurve,
  prior: number,
): Map<string, SectorCurve> {
  const comps = fitComps(live);
  const byCat = new Map<string, LiveComp[]>();
  for (const p of comps) {
    const cat = p.category ?? 'Other';
    const list = byCat.get(cat) ?? [];
    list.push(p);
    byCat.set(cat, list);
  }
  const out = new Map<string, SectorCurve>();
  const cats = new Set<string>();
  for (const p of live) cats.add(p.category ?? 'Other');
  for (const cat of cats) {
    const list = byCat.get(cat) ?? [];
    const med = list.length > 0 ? median(list.map((p) => p.mcap_usd / p.tvl_usd)) : null;
    const shrunk =
      med === null
        ? curve.global_median
        : (list.length * med + prior * curve.global_median) / (list.length + prior);
    out.set(cat, {
      category: cat,
      multiple: Math.round(shrunk * 1e4) / 1e4,
      comps: list.length,
      median: med === null ? null : Math.round(med * 1e4) / 1e4,
      ref_tvl: list.length > 0 ? median(list.map((p) => p.tvl_usd)) : curve.median_tvl,
    });
  }
  if (!out.has('Other')) {
    out.set('Other', {
      category: 'Other',
      multiple: curve.global_median,
      comps: 0,
      median: null,
      ref_tvl: curve.median_tvl,
    });
  }
  return out;
}

/** How far the size factor may move a protocol from its sector's multiple. */
export const SIZE_FACTOR_FLOOR = 0.5;
export const SIZE_FACTOR_CAP = 2;

/**
 * The multiple one protocol gets under the curve: its sector's base multiple,
 * moved by (TVL / sector median TVL)^gamma, clamped so the size effect can
 * at most halve or double the sector's own pricing. Returns the multiple and
 * the size factor that produced it, so the board can show both.
 */
export function curveMultiple(
  tvlUsd: number,
  category: string | null,
  sectors: Map<string, SectorCurve>,
  curve: SizeCurve,
  multipleFloor: number,
  multipleCap: number,
): { multiple: number; size_factor: number } {
  const sector = sectors.get(category ?? 'Other') ?? sectors.get('Other')!;
  const ref = sector.ref_tvl > 0 ? sector.ref_tvl : curve.median_tvl;
  const raw = ref > 0 && tvlUsd > 0 ? Math.pow(tvlUsd / ref, curve.gamma) : 1;
  const sizeFactor = Math.min(SIZE_FACTOR_CAP, Math.max(SIZE_FACTOR_FLOOR, raw));
  const multiple = Math.min(multipleCap, Math.max(multipleFloor, sector.multiple * sizeFactor));
  return { multiple: Math.round(multiple * 1e4) / 1e4, size_factor: Math.round(sizeFactor * 1e4) / 1e4 };
}

/** One blind prediction: a live protocol's market cap, guessed from the others. */
function predictFlat(target: LiveComp, others: LiveComp[], prior: number): number {
  const ratios = others.map((p) => p.mcap_usd / p.tvl_usd);
  const gm = median(ratios);
  const cat = others.filter((p) => (p.category ?? 'Other') === (target.category ?? 'Other'));
  if (cat.length === 0) return target.tvl_usd * gm;
  const med = median(cat.map((p) => p.mcap_usd / p.tvl_usd));
  return target.tvl_usd * ((cat.length * med + prior * gm) / (cat.length + prior));
}

function predictCurve(target: LiveComp, others: LiveComp[], prior: number): number {
  const curve = fitSizeCurve(others);
  const sectors = sectorCurves(others, curve, prior);
  const { multiple } = curveMultiple(target.tvl_usd, target.category, sectors, curve, 0.001, 1e6);
  return target.tvl_usd * multiple;
}

/** Median and mean of |log10(pred / actual)|, as multiples, and the 2x share. */
function errorStats(errors: number[]): { median_x: number; mean_x: number; within_2x: number } {
  const sorted = [...errors].sort((a, b) => a - b);
  const n = sorted.length;
  const medianLog = n % 2 === 1 ? sorted[Math.floor(n / 2)]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
  const meanLog = errors.reduce((a, b) => a + b, 0) / n;
  const within = errors.filter((e) => e <= LOG10(2)).length / n;
  return {
    median_x: Math.round(Math.pow(10, medianLog) * 100) / 100,
    mean_x: Math.round(Math.pow(10, meanLog) * 100) / 100,
    within_2x: Math.round(within * 1000) / 1000,
  };
}

/**
 * The blind test: leave-one-out over the fit comps. Each live protocol is
 * predicted twice, once from the flat sector median and once from the curve,
 * each time fitted on all the others, so neither model ever sees the answer
 * it is graded on. Returns both error rates side by side.
 */
export function looBacktest(live: LiveComp[], prior: number): CurveBacktest {
  const comps = fitComps(live);
  const flatErrors: number[] = [];
  const curveErrors: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const target = comps[i]!;
    const others = comps.slice(0, i).concat(comps.slice(i + 1));
    if (others.length === 0) continue;
    const flat = predictFlat(target, others, prior);
    const curved = predictCurve(target, others, prior);
    if (flat > 0 && Number.isFinite(flat)) flatErrors.push(Math.abs(LOG10(flat / target.mcap_usd)));
    if (curved > 0 && Number.isFinite(curved)) curveErrors.push(Math.abs(LOG10(curved / target.mcap_usd)));
  }
  const flat = errorStats(flatErrors.length > 0 ? flatErrors : [0]);
  const curved = errorStats(curveErrors.length > 0 ? curveErrors : [0]);
  return {
    n: comps.length,
    flat_median_x: flat.median_x,
    flat_mean_x: flat.mean_x,
    flat_within_2x: flat.within_2x,
    curve_median_x: curved.median_x,
    curve_mean_x: curved.mean_x,
    curve_within_2x: curved.within_2x,
  };
}

/**
 * The scatter the dashboard charts: up to `count` live comps, spread across
 * the TVL range so the small and the large both show, as raw TVL and market
 * cap (the page takes the logs). Sorted by TVL, so the curve's slope reads
 * left to right.
 */
export function scatterSample(live: LiveComp[], count: number): CurvePoint[] {
  const comps = fitComps(live).sort((a, b) => a.tvl_usd - b.tvl_usd);
  if (comps.length <= count) return comps.map((p) => ({ tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd }));
  const step = comps.length / count;
  const out: CurvePoint[] = [];
  for (let i = 0; i < count; i++) {
    const p = comps[Math.min(comps.length - 1, Math.floor(i * step))]!;
    out.push({ tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd });
  }
  return out;
}
