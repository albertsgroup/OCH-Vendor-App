import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'
import type { MatchGroup, MatchVendorItem } from '@/types/database'

// ── Category keyword map ──────────────────────────────────────────────────────
// Items are assigned to categories so all vendors' items in the same category
// land in the same AI call — preventing cross-vendor matches from being split
// across alphabetical chunks.
const CATEGORY_KEYWORDS: [string, string[]][] = [
  ['Seafood', [
    'FISH', 'SALMON', 'TUNA', 'SHRIMP', 'LOBSTER', 'CRABMEAT', 'CRAB',
    'SCALLOP', 'HADDOCK', 'COD', 'TILAPIA', 'CLAM', 'OYSTER', 'SQUID',
    'CALAMARI', 'HALIBUT', 'FLOUNDER', 'CATFISH', 'POLLOCK', 'MAHI',
    'SWORDFISH', 'BASS', 'TROUT', 'ICELANDIC', 'NORTH SHORE', 'PORTICO',
    'SEAFOOD', 'ANCHOV', 'GROUPER', 'SNAPPER',
  ]],
  ['Poultry', [
    'CHICKEN', 'TURKEY', 'DUCK', 'CORNISH',
  ]],
  ['Beef & Pork', [
    'BEEF', 'PORK', 'BRISKET', 'RIBS', 'BACON', ' HAM', 'SAUSAGE',
    'HOT DOG', 'LAMB', 'VEAL', 'PROSCIUTTO', 'SALAMI', 'PEPPERONI',
    'BRATWURST', 'CHORIZO', 'SEABOARD', 'PHILLY STEAK',
  ]],
  ['Dairy & Cheese', [
    'CHEESE', 'BUTTER', 'MOZZARELLA', 'CHEDDAR', 'PROVOLONE', 'PARMESAN',
    'SWISS', 'BRIE', 'GOUDA', 'RICOTTA', 'MILK', 'SOUR CREAM', 'CREAM CHEESE',
    'BUTTERMILK', 'GALBANI', 'SORRENTO', 'CABOT', 'COOPER', 'BELGIOIOSO',
    'ALOUETTE', 'MUENSTER', 'COLBY', 'MONTEREY JACK', 'PEPPER JACK',
    'BLUE CHEESE', 'WHIPPED CREAM', 'HALF AND HALF',
  ]],
  ['Eggs', ['EGG', ' DOZ']],
  ['Produce & Fruit', [
    'LETTUCE', 'TOMATO', 'ONION', 'MUSHROOM', 'PEPPER', 'BROCCOLI',
    'GARLIC', 'BASIL', 'PARSLEY', 'CILANTRO', 'THYME', 'ROSEMARY',
    'KALE', 'SPINACH', 'ARUGULA', 'AVOCADO', 'CUCUMBER',
    'ZUCCHINI', 'EGGPLANT', 'CELERY', 'CARROT', 'CABBAGE', 'SAUERKRAUT',
    'STRAWBERR', 'BLUEBERR', 'RASPBERRY', 'BLACKBERR', 'CHERRY',
    'LEMON', 'LIME', 'APPLE', 'ORANGE', 'MANGO', 'PINEAPPLE',
    'FRUIT', 'VEGETABLE', 'NORMANDY BLEND', 'HERB',
  ]],
  ['Frozen & Breaded', [
    'FRENCH FRIES', 'ONION RING', 'HASH BROWN', 'TATER TOT',
    'MOZZARELLA STICK', 'MOZZARELLA TRIANGLE', 'EGG ROLL WRAPPER',
    'BREADED', 'NUGGET', 'MEATBALL', 'GNOCCHI', 'RAVIOLI', 'PIEROGI',
    'WONTON', 'POTATO CHIP', 'IQF',
  ]],
  ['Bakery & Bread', [
    'ROLL', 'BREAD', 'BUN', 'BISCUIT', 'PIE', 'CAKE', 'CROISSANT', 'BAGEL',
    'MUFFIN', 'BRIOCHE', 'PRETZEL', 'SLIDER', 'HAMBURGER ROLL', 'HOAGIE',
    'POTATO ROLL', 'RYE', 'SOURDOUGH', 'CIABATTA', 'NAAN', 'PITA',
    'PIZZA CRUS', 'TEXAS TOAST', 'STONEFIRE', 'CHEESECAKE',
    'MARKET SQUARE', "MARTIN'S", 'MARTINS', 'COSTANZO', 'LE PAN', 'BRIDGFORD',
    'ANNABELLS',
  ]],
  ['Pasta & Dry Goods', [
    'PASTA', 'CAVATAPPI', 'RIGATONI', 'PENNE', 'SPAGHETTI', 'FETTUCCINE',
    'LINGUINE', 'FARFALLE', 'ORZO', 'SAN MARCO',
    'RICE', 'FLOUR', 'OIL', 'VINEGAR', 'HOT SAUCE', 'KETCHUP', 'MUSTARD',
    'MAYONNAISE', 'RANCH', 'SPICE', 'SEASONING', 'BREADCRUMB', 'PANKO',
    'HONEY', 'SYRUP', 'BLAZIN',
  ]],
  ['Supplies & Other', [
    'NAPKIN', 'GLOVE', 'CLEANING', 'SOAP', 'TOWEL', 'STRAW', 'UTENSIL',
    'FORK', 'KNIFE', 'SPOON', 'TRAY', 'DEPOSIT', 'CRATE',
  ]],
]

const MAX_ITEMS_PER_CALL = 150

function categorizeItem(itemName: string): string {
  const upper = itemName.toUpperCase()
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some(kw => upper.includes(kw))) return category
  }
  return 'Other'
}

// ── Tool schema ───────────────────────────────────────────────────────────────
const GROUP_TOOL: Anthropic.Tool = {
  name: 'group_vendor_items',
  description: 'Group similar food/beverage supply items from different vendors into matched rows.',
  input_schema: {
    type: 'object' as const,
    properties: {
      groups: {
        type: 'array',
        description: 'Each group = one product. Every input index MUST appear in exactly one group.',
        items: {
          type: 'object',
          properties: {
            commonName: {
              type: 'string',
              description: 'Short, professional product name including key specs. E.g. "Shredded Whole Milk Mozzarella 6/5LB", "Haddock Fillet Skinless 10-12oz 10LB". Not vendor jargon.',
            },
            confidence: {
              type: 'string',
              enum: ['high', 'medium', 'low'],
              description: 'high = same brand + same spec; medium = same spec different brand; low = plausible substitute only',
            },
            matchReason: {
              type: 'string',
              description: 'Only for groups with 2+ vendors. One line: e.g. "Same brand (Galbani) · same pack (6/5LB)" or "Both 10-12oz skinless haddock · 10LB case"',
            },
            rowIds: {
              type: 'array',
              description: 'Integer indices of items in this group (one per vendor max). Use the number at the start of each input line.',
              items: { type: 'number' },
            },
          },
          required: ['commonName', 'rowIds'],
        },
      },
    },
    required: ['groups'],
  },
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    return await handleAIMatch(req)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[ai-match] Unhandled error:', message)
    return NextResponse.json({ error: `Server error: ${message}` }, { status: 500 })
  }
}

async function handleAIMatch(req: NextRequest) {
  const week = req.nextUrl.searchParams.get('week')
  if (!week) return NextResponse.json({ error: 'week parameter required' }, { status: 400 })

  const admin = createAdminClient()

  const { data: uploads } = await admin
    .from('vendor_uploads')
    .select('id, vendor_id')
    .eq('week_start', week)

  if (!uploads || uploads.length === 0) return NextResponse.json({ groups: [] })

  const vendorIds = [...new Set(uploads.map(u => u.vendor_id))]
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, vendor_name')
    .in('id', vendorIds)

  const vendorNameById: Record<string, string> = {}
  profiles?.forEach(p => { vendorNameById[p.id] = p.vendor_name ?? 'Unknown' })

  const vendorByUpload: Record<string, string> = {}
  uploads.forEach(u => { vendorByUpload[u.id] = u.vendor_id })

  const uploadIds = uploads.map(u => u.id)
  const { data: rows } = await admin
    .from('vendor_upload_rows')
    .select('id, upload_id, vendor_item_number, item_name, unit_size, price')
    .in('upload_id', uploadIds)

  if (!rows || rows.length === 0) return NextResponse.json({ groups: [] })

  const rowById: Record<string, MatchVendorItem> = {}
  rows.forEach(r => {
    const vendorId = vendorByUpload[r.upload_id]
    rowById[r.id] = {
      rowId: r.id,
      vendorId,
      vendorName: vendorNameById[vendorId] ?? 'Unknown',
      itemName: r.item_name ?? '—',
      vendorItemNumber: r.vendor_item_number,
      unitSize: (r as { unit_size?: string | null }).unit_size ?? null,
      price: Number(r.price),
    }
  })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 })

  const client = new Anthropic({ apiKey })
  const vendorList = vendorIds.map(id => vendorNameById[id]).join(', ')

  // ── Assign each row to a category ──────────────────────────────────────────
  const byCategory: Record<string, typeof rows> = {}
  rows.forEach(r => {
    const cat = categorizeItem(rowById[r.id]?.itemName ?? '')
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(r)
  })

  // ── Build call batches (one per category, split if > MAX_ITEMS_PER_CALL) ───
  // idByIndex[globalIdx] → UUID, filled in category order
  const idByIndex: string[] = []
  type Batch = { items: typeof rows; offset: number; label: string }
  const batches: Batch[] = []

  for (const [cat, catRows] of Object.entries(byCategory)) {
    for (let i = 0; i < catRows.length; i += MAX_ITEMS_PER_CALL) {
      const chunk = catRows.slice(i, i + MAX_ITEMS_PER_CALL)
      const offset = idByIndex.length
      chunk.forEach(r => idByIndex.push(r.id))
      const partLabel = catRows.length > MAX_ITEMS_PER_CALL
        ? `${cat} part ${Math.floor(i / MAX_ITEMS_PER_CALL) + 1}`
        : cat
      batches.push({ items: chunk, offset, label: partLabel })
    }
  }

  const systemPrompt = `You are comparing food and beverage supply items from multiple vendor order guides for a restaurant called Old City Hall BBQ (OCH).

Your job: group items that refer to the SAME product across vendors so OCH can compare prices side by side.

MATCHING RULES (apply in this priority order):
1. BRAND MATCH — if two items share the same brand name, they are almost certainly the same product and must be grouped. Key brands: Galbani, Sorrento, Cooper, Icelandic, Martin's/Martins, Costanzo, Tyson, Cabot, BelGioioso, Arrezzio, Portico, Brakebush, Frank's, Barilla, Seaboard, Ore-Ida, Cavendish, McCain.
2. PACK FORMAT + PRODUCT — same pack config (e.g. "6/5LB", "4/1GAL", "36/1LB", "40/4OZ") AND same product type = strong match even with different brands.
3. SPEC MATCH — same size/grade spec (e.g. "10-12oz fillet", "U/10 dry scallops") + same product = match.

Additional rules:
- Only group items OCH would choose ONE vendor to supply (true competing alternatives)
- Do NOT group items with meaningfully different specs (10-12oz ≠ 8-10oz fillet; U/10 ≠ 20/30 scallop)
- Every single index in the input MUST appear in exactly one group — never skip any
- Single-vendor items still get their own group (one rowId); omit matchReason for those
- For matched groups (2+ vendors): always provide both confidence and matchReason
- commonName: short, professional, readable — include key specs e.g. "Shredded Whole Milk Mozzarella 6/5LB" not "MOZZ SHRD WM 6/5LB BLKHD"
- rowIds are INTEGER INDICES from the input (not UUIDs)
- Vendors in this upload: ${vendorList}`

  type RawGroup = {
    commonName: string
    confidence?: 'high' | 'medium' | 'low'
    matchReason?: string
    rowIds: (string | number)[]
  }

  // ── Process all batches in parallel ────────────────────────────────────────
  const batchGroupsArray = await Promise.all(
    batches.map(async ({ items, offset, label }) => {
      const itemsText = items
        .map((r, localIdx) => {
          const globalIdx = offset + localIdx
          const v = rowById[r.id]
          const vendor = v.vendorName.slice(0, 14)
          const parts = [`${globalIdx}`, `[${vendor}]`, `"${v.itemName}"`]
          if (v.unitSize) parts.push(v.unitSize)
          if (v.price) parts.push(`$${v.price.toFixed(2)}`)
          return parts.join(' | ')
        })
        .join('\n')

      const fallback = (): RawGroup[] =>
        items.map((r, localIdx) => ({
          commonName: rowById[r.id]?.itemName ?? '—',
          rowIds: [offset + localIdx],
        }))

      let resp
      try {
        resp = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          system: systemPrompt,
          tools: [GROUP_TOOL],
          tool_choice: { type: 'tool', name: 'group_vendor_items' },
          messages: [{
            role: 'user',
            content: `Compare and group these ${items.length} items (${label}):\n\n${itemsText}`,
          }],
        })
      } catch (err) {
        console.error(`[ai-match] Batch "${label}" API error:`, err instanceof Error ? err.message : err)
        return fallback()
      }

      if (resp.stop_reason === 'max_tokens') {
        console.error(`[ai-match] Batch "${label}" truncated`)
        return fallback()
      }

      const toolUse = resp.content.find(b => b.type === 'tool_use') as
        | { type: 'tool_use'; input: { groups: RawGroup[] } }
        | undefined

      if (!toolUse?.input?.groups || !Array.isArray(toolUse.input.groups)) {
        console.error(`[ai-match] Batch "${label}" malformed:`, JSON.stringify(resp.content).slice(0, 300))
        return fallback()
      }

      console.log(`[ai-match] "${label}": ${toolUse.input.groups.length} groups from ${items.length} items`)
      return toolUse.input.groups
    })
  )

  const rawGroups = batchGroupsArray.flat()

  // ── Resolve integer indices → UUIDs → vendor items ─────────────────────────
  const resolvedGroups = rawGroups
    .map(g => {
      const vendorItems = g.rowIds
        .map(rawId => {
          const idx = Number(rawId)
          const uuid = (!isNaN(idx) && idx >= 0 && idx < idByIndex.length)
            ? idByIndex[idx]
            : String(rawId)
          return rowById[uuid]
        })
        .filter(Boolean)
      return { commonName: g.commonName, confidence: g.confidence, matchReason: g.matchReason, vendorItems }
    })
    .filter(g => g.vendorItems.length > 0)

  // ── Deduplicate same-vendor items within a group ────────────────────────────
  // If AI puts two items from the same vendor in one group, keep the first and
  // spin extras into single-vendor groups so the display stays correct.
  const groups: MatchGroup[] = []
  for (const g of resolvedGroups) {
    const seenVendors = new Set<string>()
    const keep: typeof g.vendorItems = []
    const spill: typeof g.vendorItems = []
    for (const vi of g.vendorItems) {
      if (!seenVendors.has(vi.vendorId)) {
        seenVendors.add(vi.vendorId)
        keep.push(vi)
      } else {
        spill.push(vi)
      }
    }
    const isMatched = keep.length > 1
    groups.push({
      commonName: g.commonName,
      isMatched,
      confidence: isMatched ? g.confidence : undefined,
      matchReason: isMatched ? g.matchReason : undefined,
      vendorItems: keep,
    })
    spill.forEach(vi => groups.push({ commonName: vi.itemName, isMatched: false, vendorItems: [vi] }))
  }

  // Sort: matched first (high confidence → medium → low), then alphabetical
  const confOrder = { high: 0, medium: 1, low: 2 }
  groups.sort((a, b) => {
    if (a.isMatched !== b.isMatched) return a.isMatched ? -1 : 1
    if (a.isMatched) {
      const ca = confOrder[a.confidence ?? 'low']
      const cb = confOrder[b.confidence ?? 'low']
      if (ca !== cb) return ca - cb
    }
    return a.commonName.localeCompare(b.commonName)
  })

  return NextResponse.json({ groups })
}
