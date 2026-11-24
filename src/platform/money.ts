/** Money is always integer santim (1 ETB = 100 santim). */
export const formatETB = (cents: number): string =>
  new Intl.NumberFormat("en-ET", { style: "currency", currency: "ETB" }).format(cents / 100);

/** Percentage of an amount, rounded half-up to a whole santim. */
export const percentOf = (cents: number, percent: number): number => Math.round((cents * percent) / 100);
