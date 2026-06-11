/**
 * AI-powered item matching — uses Claude tool use for guaranteed structured output.
 * Given parsed vendor rows and the internal items catalogue,
 * Claude decides: confident match, needs admin review, or brand-new item.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { ParsedRow } from './parseUpload'

export type MatchType = 'confident' | 'review' | 'new'

export interface ItemMatch {
  row_index: number
  match_type: MatchType
  internal_item_id: string | null
  confidence: number                // 0.0–1.0
  reason: string
  suggested_common_name: string | null  // for 'new' items
}

export interface InternalItem {
  id: string
  item_number: string
  item_name: string
}

const MATCH_TOOL: Anthropic.Tool = {
  name: 'match_items',
  description: 'Match each vendor item to an internal catalogue item or flag as new.',
  input_schema: {
    type: 'object' as const,
    properties: {
      matches: {
        type: 'array',
        description: 'One entry per vendor item row. Must include every row_index provided.',
        items: {
          type: 'object',
          properties: {
            row_index: { type: 'number', description: 'The row_index from the vendor item' },
            match_type: {
              type: 'string',
              enum: ['confident', 'review', 'new'],
              description: 'confident = >85% sure it matches; review = possible match, needs admin; new = nothing similar in catalogue',
            },
            internal_item_id: {
              type: 'string',
              description: 'UUID of the matched internal item. Empty string if match_type is "new".',
            },
            confidence: {
              type: 'number',
              description: 'Confidence score 0.0–1.0. Use 0 for "new" items.',
            },
            reason: {
              type: 'string',
              description: 'Short explanation shown to the admin. E.g. "Vendor\'s Cascade Hops 1lb matches internal Cascade Hops"',
            },
            suggested_common_name: {
              type: 'string',
              description: 'For "new" items only: a short, generic common name. E.g. "Chicken Breasts", "Pilsner Malt". Empty string otherwise.',
            },
          },
          required: ['row_index', 'match_type', 'confidence', 'reason'],
        },
      },
    },
    required: ['matches'],
  },
}

const MATCH_CHUNK_SIZE = 60  // items per Claude call

export async function matchItemsWithAI(
  vendorName: string,
  rows: ParsedRow[],
  internalItems: InternalItem[]
): Promise<ItemMatch[]> {

  if (rows.length === 0) return []

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
    return rows.map(r => fallbackMatch(r, 'AI unavailable — please review manually'))
  }

  const client = new Anthropic({ apiKey })

  const catalogueText = internalItems.length > 0
    ? internalItems.map(i => `ID:${i.id} | #${i.item_number} | ${i.item_name}`).join('\n')
    : '(empty — no internal items yet, mark everything as "new")'

  const systemPrompt = `You are matching vendor products to Old City Hall Brewery's internal item catalogue.

The brewery uses a single generic internal name for similar products from multiple vendors.
Examples: "Chicken Breast (Bone-In)", "BC Free Range Chicken Breast", "Chicken Breast 8oz" all → "Chicken Breasts"

For each vendor item, decide:
• confident — you are >85% sure this is the same product as an internal item
• review — there might be a match but you're not certain; include your best guess internal_item_id
• new — nothing in the catalogue is remotely similar; suggest a clean short common name

Rules:
• Be conservative: when in doubt choose "review" over "confident"
• Common names for new items: short, generic, professional (e.g. "Cascade Hops", "Pilsner Malt", "Chicken Breasts")
• You MUST return a match entry for every single row_index provided`

  // Process in chunks so we stay within token limits
  const chunks: ParsedRow[][] = []
  for (let i = 0; i < rows.length; i += MATCH_CHUNK_SIZE) {
    chunks.push(rows.slice(i, i + MATCH_CHUNK_SIZE))
  }

  const allMatches: ItemMatch[] = []

  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    const chunk = chunks[chunkIdx]

    const vendorItemsText = chunk
      .map(r => `row_index:${r.row_index} | #${r.vendor_item_number ?? 'N/A'} | "${r.item_name ?? 'Unknown'}"${r.unit_size ? ` | ${r.unit_size}` : ''} | $${r.price.toFixed(2)}`)
      .join('\n')

    const userContent = `VENDOR: ${vendorName}

INTERNAL CATALOGUE:
${catalogueText}

VENDOR ITEMS TO MATCH (chunk ${chunkIdx + 1}/${chunks.length}):
${vendorItemsText}`

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 8000,
        system: systemPrompt,
        tools: [MATCH_TOOL],
        tool_choice: { type: 'tool', name: 'match_items' },
        messages: [{ role: 'user', content: userContent }],
      })

      const toolUse = response.content.find(b => b.type === 'tool_use') as
        | { type: 'tool_use'; input: { matches: Array<Record<string, unknown>> } }
        | undefined

      if (!toolUse) {
        console.error(`[matchItems] Chunk ${chunkIdx + 1}: no tool_use block`, JSON.stringify(response.content))
        chunk.forEach(r => allMatches.push(fallbackMatch(r, 'AI matching failed — please review')))
        continue
      }

      const rawMatches = toolUse.input.matches ?? []
      console.log(`[matchItems] Chunk ${chunkIdx + 1}: ${rawMatches.length} matches returned`)

      // Build a set of row_indexes returned so we can fill any gaps
      const returnedIndexes = new Set(rawMatches.map(m => Number(m.row_index)))

      for (const m of rawMatches) {
        allMatches.push({
          row_index: Number(m.row_index),
          match_type: (['confident', 'review', 'new'].includes(String(m.match_type))
            ? m.match_type as MatchType
            : 'review'),
          internal_item_id: m.internal_item_id ? String(m.internal_item_id) || null : null,
          confidence: typeof m.confidence === 'number' ? Math.min(1, Math.max(0, m.confidence)) : 0,
          reason: String(m.reason ?? ''),
          suggested_common_name: m.suggested_common_name ? String(m.suggested_common_name) || null : null,
        })
      }

      // Fill in any rows Claude missed
      chunk.forEach(r => {
        if (!returnedIndexes.has(r.row_index)) {
          allMatches.push(fallbackMatch(r, 'Not returned by AI — please review'))
        }
      })

    } catch (err) {
      console.error(`[matchItems] Chunk ${chunkIdx + 1} error:`, err)
      chunk.forEach(r => allMatches.push(fallbackMatch(r, 'AI matching error — please review')))
    }
  }

  return allMatches
}

function fallbackMatch(r: ParsedRow, reason: string): ItemMatch {
  return {
    row_index: r.row_index,
    match_type: 'review',
    internal_item_id: null,
    confidence: 0,
    reason,
    suggested_common_name: null,
  }
}

// -------------------------------------------------------
// Generate a unique OCH item number
// -------------------------------------------------------
export async function generateOCHNumber(existingNumbers: string[]): Promise<string> {
  const existing = new Set(existingNumbers)
  for (let attempts = 0; attempts < 50; attempts++) {
    const candidate = `OCH${Math.floor(1000 + Math.random() * 9000)}`
    if (!existing.has(candidate)) return candidate
  }
  return `OCH${Date.now().toString().slice(-4)}`
}
