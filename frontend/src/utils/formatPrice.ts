/**
 * Price from API (string): strip trailing .00 (e.g. 100.00 → 100, 99.50 unchanged).
 */
export function formatPrice(price: string): string {
  if (/\.00$/.test(price)) return price.replace(/\.00$/, '')
  return price
}

/**
 * Amount (number): no decimals when zero (100 → "100", 99.5 → "99.50").
 */
export function formatAmount(amount: number): string {
  if (Number.isInteger(amount) || Math.abs(amount - Math.round(amount)) < 1e-9) {
    return String(Math.round(amount))
  }
  return amount.toFixed(2)
}
