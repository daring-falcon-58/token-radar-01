// A farm plan's economics (radar-4): what farming one protocol actually
// costs, and whether the launch is big enough to pay for it. radar-2's plan
// listed a capital and a gas figure per step, but never added them up and
// never said whether the row was worth farming at all. A farmer deciding
// between two hundred rows needs a total and a verdict, not six steps.
//
// The cost is gas only: the capital is deposited and can be withdrawn, so
// it is not spent, but it is stated. Gas depends on the chain the position
// sits on, because a transaction on Ethereum costs an order of magnitude
// more than the same action on a rollup, and on the hold: every week of
// qualifying activity is another transaction. The verdict weighs the cost
// against the launch's size: a launch is assumed to send 5% of its EXPECTED
// value to its farmers (implied value weighted by the launch odds, so a
// launch that may never come does not count as if it were certain), and a
// farmer is assumed to need $100 of profit for the position to be worth the
// trouble, so the capacity is how many farmers the launch supports at that
// profit. Both assumptions are stated on the dashboard, and the verdict is
// a rule on the two numbers, not a feeling:
//
//   Strong    capacity >= 5,000 farmers and total gas <= $15
//   Worth it  capacity >= 500 farmers and total gas <= $40
//   Marginal  capacity >= 50 farmers
//   Thin      anything smaller: the launch cannot pay many farmers

/** A row's farm economics: the total gas, the capital at stake, and the verdict. */
export interface FarmEconomics {
  /** Total gas for the whole plan: setup, one action a week through the hold, exit. */
  cost_usd: number;
  /** Capital the plan deposits (returned on exit, not spent). */
  capital_usd: number;
  /** Days the position is held. */
  hold_days: number;
  /** Farmers the launch supports at $100 profit each, at a 5% farmer share. */
  capacity: number;
  /** The verdict: Strong, Worth it, Marginal, or Thin. */
  verdict: 'Strong' | 'Worth it' | 'Marginal' | 'Thin';
}

/** The farmer share of a launch's implied value, and the profit one farmer needs. */
export const FARMER_SHARE = 0.05;
export const PROFIT_PER_FARMER_USD = 100;

/** Gas for one farm transaction on a chain, in dollars. Ethereum is the
 *  expensive outlier; rollups and cheap chains cost cents. Unknown chains
 *  take the middle price. */
export function gasPerAction(chains: string[]): number {
  const first = (chains.length > 0 ? chains[0]! : '').toLowerCase();
  if (first.includes('ethereum')) return 6;
  if (first.includes('base') || first.includes('arbitrum') || first.includes('optimism')) return 0.3;
  if (first.includes('binance') || first.includes('bnb')) return 0.15;
  if (first.includes('solana')) return 0.01;
  if (first.includes('polygon')) return 0.05;
  if (first.includes('avalanche')) return 0.5;
  if (first === '') return 1;
  return 1;
}

/** How long to hold, from the protocol's age: younger protocols get a longer
 *  qualifying window, because a new protocol's snapshots have fewer chances
 *  to catch the activity. */
export function holdDaysFor(ageDays: number | null): number {
  if (ageDays === null) return 30;
  if (ageDays < 180) return 60;
  if (ageDays < 365) return 45;
  return 30;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
export function capitalFor(tvlUsd: number): number {
  if (tvlUsd >= 5_000_000_000) return 250;
  if (tvlUsd >= 1_000_000_000) return 150;
  if (tvlUsd >= 100_000_000) return 100;
  return 50;
}

/**
 * One row's farm economics. `expectedValueUsd` is the launch's expected value
 * from the model (implied value weighted by the launch odds); the capacity
 * follows from it and the two stated assumptions, and the verdict is a rule
 * on capacity and total gas.
 */
export function farmEconomics(
  chains: string[],
  tvlUsd: number,
  ageDays: number | null,
  expectedValueUsd: number,
): FarmEconomics {
  const hold = holdDaysFor(ageDays);
  const gas = gasPerAction(chains);
  const weeks = Math.ceil(hold / 7);
  // Setup, one qualifying action a week, and the exit: 2 + weeks transactions.
  const cost = Math.max(1, Math.round(gas * (2 + weeks)));
  const capital = capitalFor(tvlUsd);
  const capacity = Math.max(0, Math.floor((FARMER_SHARE * expectedValueUsd) / PROFIT_PER_FARMER_USD));
  let verdict: FarmEconomics['verdict'];
  if (capacity >= 5000 && cost <= 15) verdict = 'Strong';
  else if (capacity >= 500 && cost <= 40) verdict = 'Worth it';
  else if (capacity >= 50) verdict = 'Marginal';
  else verdict = 'Thin';
  return { cost_usd: cost, capital_usd: capital, hold_days: hold, capacity, verdict };
}

/** How many rows of a board carry each verdict, for the dashboard's summary. */
export function verdictCounts(verdicts: Array<FarmEconomics['verdict']>): {
  Strong: number;
  'Worth it': number;
  Marginal: number;
  Thin: number;
} {
  const out = { Strong: 0, 'Worth it': 0, Marginal: 0, Thin: 0 };
  for (const v of verdicts) out[v] += 1;
  return out;
}
