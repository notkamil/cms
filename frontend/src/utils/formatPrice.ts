/**
 * Цена из API (строка): убираем копейки, если они нулевые (100.00 → 100, 99.50 → 99.50).
 */
export function formatPrice(price: string): string {
  if (/\.00$/.test(price)) return price.replace(/\.00$/, '')
  return price
}

/**
 * Сумма (число): без копеек, если они нулевые (100 → "100", 99.5 → "99.50").
 */
export function formatAmount(amount: number): string {
  if (Number.isInteger(amount) || Math.abs(amount - Math.round(amount)) < 1e-9) {
    return String(Math.round(amount))
  }
  return amount.toFixed(2)
}
