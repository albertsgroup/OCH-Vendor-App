/**
 * Parses vendor pack-size strings and returns total case weight in pounds.
 *
 * Handles:
 *   "6/5LB"     → 30 lb       (6 packs × 5 lb)
 *   "10/3#"     → 30 lb       (10 packs × 3 lb)
 *   "10#"       → 10 lb       (bare weight, 1 pack)
 *   "5 LB"      → 5 lb
 *   "12/7 OZ"   → 5.25 lb     (84 oz ÷ 16)
 *   "16OZ"      → 1 lb
 *   "2/5# 24CT" → 10 lb       (trailing count token ignored)
 *   "4/1GAL"    → null        (volume, not weight)
 *   "60CT"      → null        (count unit)
 */
export function parsePoundsFromUnitSize(unitSize: string | null | undefined): number | null {
  if (!unitSize) return null
  const s = unitSize.trim().toUpperCase()

  const WEIGHT_UNITS = '(LB|LBS|#|OZ|OUNCE|OUNCES|G|GRAM|GRAMS|KG)'

  // Slash pattern: QTY/WEIGHT[UNIT] — trailing tokens (e.g. 24CT) are ignored
  const slashMatch = s.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*\\/\\s*(\\d+(?:\\.\\d+)?)\\s*${WEIGHT_UNITS}`))
  if (slashMatch) {
    const qty = parseFloat(slashMatch[1])
    const weight = parseFloat(slashMatch[2])
    const unit = slashMatch[3]
    if (isNaN(qty) || isNaN(weight) || qty <= 0 || weight <= 0) return null
    return toOounds(qty * weight, unit)
  }

  // Bare weight pattern: WEIGHT[UNIT] with no slash — e.g. "10#", "5 LB", "16OZ"
  const bareMatch = s.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*${WEIGHT_UNITS}\\b`))
  if (bareMatch) {
    const weight = parseFloat(bareMatch[1])
    const unit = bareMatch[2]
    if (isNaN(weight) || weight <= 0) return null
    return toOounds(weight, unit)
  }

  return null
}

function toOounds(amount: number, unit: string): number | null {
  if (unit === 'LB' || unit === 'LBS' || unit === '#') return amount
  if (unit === 'OZ' || unit === 'OUNCE' || unit === 'OUNCES') return amount / 16
  if (unit === 'G'  || unit === 'GRAM'  || unit === 'GRAMS')  return amount / 453.592
  if (unit === 'KG') return amount * 2.20462
  return null
}

/**
 * For non-weight items, returns the total unit count in the case.
 * Returns null for weight-based items (use parsePoundsFromUnitSize for those).
 *
 *   "4/1GAL"  → 4   (4 jugs)
 *   "24/CS"   → 24
 *   "100CT"   → 100
 *   "60/CS"   → 60
 *   "6/5LB"   → null (weight-based)
 */
export function parseCountFromUnitSize(unitSize: string | null | undefined): number | null {
  if (!unitSize) return null
  if (parsePoundsFromUnitSize(unitSize) !== null) return null

  const s = unitSize.trim().toUpperCase()

  // Slash pattern where unit is NOT weight: take the QTY before the slash
  const slashMatch = s.match(/^(\d+(?:\.\d+)?)\s*\//)
  if (slashMatch) {
    const qty = parseFloat(slashMatch[1])
    if (!isNaN(qty) && qty > 0) return qty
  }

  // Bare count: e.g. "100CT", "24 EA", "500 PC"
  const countMatch = s.match(/^(\d+(?:\.\d+)?)\s*(CT|EA|PC|PCS|EACH|COUNT)\b/)
  if (countMatch) {
    const count = parseFloat(countMatch[1])
    if (!isNaN(count) && count > 0) return count
  }

  return null
}

export interface NormalizedPrice {
  value: number
  label: '$/lb' | '$/ct'
  total: number
}

/**
 * Returns the best normalized unit price for display and comparison.
 * Prefers $/lb; falls back to $/ct for non-weight items.
 */
export function normalizePrice(price: number, unitSize: string | null | undefined): NormalizedPrice | null {
  const lbs = parsePoundsFromUnitSize(unitSize)
  if (lbs !== null && lbs > 0) return { value: price / lbs, label: '$/lb', total: lbs }

  const count = parseCountFromUnitSize(unitSize)
  if (count !== null && count > 0) return { value: price / count, label: '$/ct', total: count }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Full 3-level price breakdown
// ─────────────────────────────────────────────────────────────────────────────

export interface PriceBreakdown {
  /** Primary — $/lb or $/ct */
  perUnit: number
  unitLabel: '$/lb' | '$/ct'
  /** Total weight (lb) or count in the full case */
  totalInCase: number

  /** Secondary — only present when the case contains multiple packs */
  packCount: number | null
  packSize: number | null
  packSizeUnit: string | null  // e.g. 'lb', 'oz', 'gal', 'ml'
  perPack: number | null       // case price ÷ packCount
}

/**
 * Full breakdown for a case price given a unit-size string.
 *
 * Examples:
 *   breakdownPrice(50, "4/5LB")   → perUnit=$2.50/lb, packCount=4, perPack=$12.50, packSize=5 lb
 *   breakdownPrice(25, "10LB")    → perUnit=$2.50/lb, no pack breakdown
 *   breakdownPrice(40, "4/1GAL")  → perUnit=$10/ct,   packCount=4, perPack=$10, packSize=1 gal
 *   breakdownPrice(80, "100CT")   → perUnit=$0.80/ct, no pack breakdown
 */
export function breakdownPrice(price: number, unitSize: string | null | undefined): PriceBreakdown | null {
  if (!unitSize || price <= 0) return null
  const s = unitSize.trim().toUpperCase()

  const WEIGHT_RE = '(LB|LBS|#|OZ|OUNCE|OUNCES|G|GRAM|GRAMS|KG)'

  // ── Multi-pack weight: QTY/SIZE UNIT  e.g. "4/5LB", "12/7 OZ" ──
  const mw = s.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*\\/\\s*(\\d+(?:\\.\\d+)?)\\s*${WEIGHT_RE}`))
  if (mw) {
    const packCount  = parseFloat(mw[1])
    const packSize   = parseFloat(mw[2])
    const rawUnit    = mw[3]
    const lbsPerPack = toOounds(packSize, rawUnit)
    if (!lbsPerPack || lbsPerPack <= 0 || packCount <= 0) return null
    return {
      perUnit:      price / (packCount * lbsPerPack),
      unitLabel:    '$/lb',
      totalInCase:  packCount * lbsPerPack,
      packCount,
      packSize,
      packSizeUnit: normaliseUnit(rawUnit),
      perPack:      price / packCount,
    }
  }

  // ── Single-pack weight: WEIGHT UNIT  e.g. "10LB", "5 LB", "16OZ" ──
  const sw = s.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*${WEIGHT_RE}\\b`))
  if (sw) {
    const weight = parseFloat(sw[1])
    const lbs    = toOounds(weight, sw[2])
    if (!lbs || lbs <= 0) return null
    return {
      perUnit: price / lbs, unitLabel: '$/lb', totalInCase: lbs,
      packCount: null, packSize: null, packSizeUnit: null, perPack: null,
    }
  }

  // ── Multi-pack non-weight: QTY/SIZE UNIT  e.g. "4/1GAL", "6/500ML" ──
  const mc = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*([A-Z]+)?/)
  if (mc) {
    const qty  = parseFloat(mc[1])
    const size = parseFloat(mc[2])
    const unit = (mc[3] ?? '').toLowerCase()
    if (qty > 0) {
      return {
        perUnit: price / qty, unitLabel: '$/ct', totalInCase: qty,
        packCount: qty,
        packSize:  size || null,
        packSizeUnit: unit || null,
        perPack: price / qty,
      }
    }
  }

  // ── Bare count: "100CT", "24 EA", "60 PC" ──
  const bc = s.match(/^(\d+(?:\.\d+)?)\s*(CT|EA|PC|PCS|EACH|COUNT)\b/)
  if (bc) {
    const count = parseFloat(bc[1])
    if (count > 0) {
      return {
        perUnit: price / count, unitLabel: '$/ct', totalInCase: count,
        packCount: null, packSize: null, packSizeUnit: null, perPack: null,
      }
    }
  }

  // ── Slash with generic suffix: "60/CS", "24/CS" ──
  const sc = s.match(/^(\d+(?:\.\d+)?)\s*\//)
  if (sc) {
    const qty = parseFloat(sc[1])
    if (qty > 0) {
      return {
        perUnit: price / qty, unitLabel: '$/ct', totalInCase: qty,
        packCount: null, packSize: null, packSizeUnit: null, perPack: null,
      }
    }
  }

  return null
}

function normaliseUnit(raw: string): string {
  const u = raw.toUpperCase()
  if (u === '#' || u === 'LBS') return 'lb'
  if (u === 'OUNCE' || u === 'OUNCES') return 'oz'
  if (u === 'GRAM' || u === 'GRAMS') return 'g'
  return raw.toLowerCase()
}
