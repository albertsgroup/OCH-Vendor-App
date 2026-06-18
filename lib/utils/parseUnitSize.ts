/**
 * Parses vendor pack-size strings and returns total case weight in pounds.
 * Returns null if the unit is not weight-based or the string is unparseable.
 *
 * Common food-service patterns:
 *   "6/5LB"     → 30 lb
 *   "6/5#"      → 30 lb
 *   "4/2.5#"    → 10 lb
 *   "2/5.5#"    → 11 lb
 *   "10/3#"     → 30 lb
 *   "12/7 oz"   → 5.25 lb  (84 oz ÷ 16)
 *   "100/1 oz"  → 6.25 lb
 *   "60/cs"     → null (count unit)
 *   "4/1GAL"    → null (volume unit)
 */
export function parsePoundsFromUnitSize(unitSize: string | null | undefined): number | null {
  if (!unitSize) return null

  const s = unitSize.trim().toUpperCase()

  // Pattern: QTY/WEIGHT[UNIT]  e.g. "6/5LB", "4/2.5#", "12/7 OZ", "6/5 LB"
  const match = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*(LB|LBS|#|OZ|OUNCE|OUNCES|G|GRAM|GRAMS|KG)?/)
  if (!match) return null

  const qty = parseFloat(match[1])
  const weight = parseFloat(match[2])
  const unit = match[3] ?? null

  if (isNaN(qty) || isNaN(weight) || qty <= 0 || weight <= 0) return null
  if (!unit) return null // no unit = can't determine if it's weight

  const total = qty * weight

  if (unit === 'LB' || unit === 'LBS' || unit === '#') return total
  if (unit === 'OZ' || unit === 'OUNCE' || unit === 'OUNCES') return total / 16
  if (unit === 'G' || unit === 'GRAM' || unit === 'GRAMS') return total / 453.592
  if (unit === 'KG') return total * 2.20462

  return null
}
