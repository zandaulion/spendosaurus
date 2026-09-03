// Money, as whole minor units.
//
// Amounts used to be stored as REAL, which is how ten payments of 0.10 came to
// 0.9999999999999999. Display rounding hid that, but the same sum decides
// whether an item is over budget -- `total > estimated * 1.10` -- so a value a
// hair either side of the line flipped a badge the family reads as fact.
//
// So nothing here holds money in a float. Amounts are integers of the smallest
// unit the currency has (bani for RON, cents for EUR), they are converted to a
// decimal exactly once on the way out, and every sum in between is integer
// addition, which cannot drift.

/** The smallest unit of each currency, as a count per major unit. */
export const MINOR_PER_MAJOR = 100;

export const VALID_CURRENCIES = ['RON', 'EUR'];

export function isValidCurrency(code) {
  return VALID_CURRENCIES.includes(code);
}

/**
 * A decimal amount from a person or an API request, as whole minor units.
 *
 * Rounds rather than truncates, because a half-banu can only arrive from a
 * conversion or a typo and rounding down would quietly lose it. Rejects
 * anything that is not a finite number, so a bad request fails loudly at the
 * edge instead of becoming a NaN that spreads through every later total.
 */
export function toMinor(value) {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num)) return null;
  // The multiplication is done on a value already rounded to the cent, so the
  // usual 1.005 * 100 = 100.49999 trap cannot bite here.
  return Math.round(num * MINOR_PER_MAJOR);
}

/** Whole minor units back to a decimal, for display and for the API. */
export function fromMinor(minor) {
  const n = Number(minor) || 0;
  return n / MINOR_PER_MAJOR;
}

/**
 * Whether spending has passed the tolerance around an estimate.
 *
 * Kept in integers on purpose: `total > estimated * 1.10` in floats is exactly
 * the comparison that used to sit a hair off. Multiplying first and comparing
 * whole units gives the same answer every time.
 */
export function isOverBudget(totalMinor, estimatedMinor, tolerancePercent = 10) {
  if (!estimatedMinor || estimatedMinor <= 0) return false;
  return totalMinor * 100 > estimatedMinor * (100 + tolerancePercent);
}

/** Percent of an estimate spent, rounded to a whole number. */
export function percentOf(totalMinor, estimatedMinor) {
  if (!estimatedMinor || estimatedMinor <= 0) return 0;
  return Math.round((totalMinor * 100) / estimatedMinor);
}
