import BN from 'bn.js';

/** Parse a decimal token string into raw base units (e.g. "1.5", 9 → 1.5e9). */
export function parseHumanAmountToRaw(
  human: string,
  decimals: number,
): { raw: BN; error?: string } {
  const t = human.trim();
  if (!t || t === '.') {
    return { raw: new BN(0), error: 'Enter an amount' };
  }
  if (!/^\d*\.?\d*$/.test(t)) {
    return { raw: new BN(0), error: 'Use digits and at most one decimal point' };
  }
  const [i, f = ''] = t.split('.');
  const intPart = i || '0';
  const frac = (f + '0'.repeat(decimals)).slice(0, decimals);
  if (!/^\d+$/.test(intPart) || !/^\d+$/.test(frac)) {
    return { raw: new BN(0), error: 'Invalid number' };
  }
  const combined = (intPart + frac).replace(/^0+/, '') || '0';
  try {
    return { raw: new BN(combined) };
  } catch {
    return { raw: new BN(0), error: 'Amount is too large' };
  }
}

const SECONDS_PER_DAY = 86_400;
/** Default cadence: 30-day months (Streamflow `period` is a fixed second interval). */
export const DEFAULT_PERIOD_SECONDS = 30 * SECONDS_PER_DAY;

/**
 * Split a linear vesting schedule into per-period and remainder-at-cliff.
 * `cliffAmount` unlocks at time `cliff` (= start here); `amountPerPeriod` then unlocks
 * `periodCount` times, every `periodSeconds`.
 */
export function splitLinearVesting(
  totalRaw: BN,
  periodCount: number,
): { amountPerPeriod: BN; cliffAmount: BN; error?: string } {
  if (periodCount < 1) {
    return { amountPerPeriod: new BN(0), cliffAmount: new BN(0), error: 'Need at least 1 period' };
  }
  if (totalRaw.lte(new BN(0))) {
    return { amountPerPeriod: new BN(0), cliffAmount: new BN(0), error: 'Total must be greater than zero' };
  }
  const n = new BN(periodCount);
  const per = totalRaw.div(n);
  const rem = totalRaw.mod(n);
  return { amountPerPeriod: per, cliffAmount: rem };
}
