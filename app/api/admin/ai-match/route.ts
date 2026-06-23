import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'
import type { MatchGroup, MatchVendorItem } from '@/types/database'

const GROUP_TOOL: Anthropic.Tool = {
  name: 'group_vendor_items',
  description: 'Group similar food/beverage items from different vendors into matched rows.',
  input_schema: {
    type: 'object' as const,
    properties: {
      groups: {
        type: 'array',
        description: 'Each group represents one product. Single-vendor items are still a group (one rowId). Every input row ID must appear in exactly one group.',
        items: {
          type: 'object',
          properties: {
            commonName: {
              type: 'string',
              description: 'Short, clean, standardized product name. E.g. "Shredded Mozzarella", "Cream Cheese", "Cayenne Hot Sauce 4/1gal"',
            },
            rowIds: {
              type: 'array',
              description: 'Integer indices of items belonging to this group (one per vendor max). Use the number at the start of each input line.',
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

  // Fetch uploads for this week
  const { data: uploads } = await admin
    .from('vendor_uploads')
    .select('id, vendor_id')
    .eq('week_start', week)

  if (!uploads || uploads.length === 0) {
    return NextResponse.json({ groups: [] })
  }

  // Fetch vendor names
  const vendorIds = [...new Set(uploads.map(u => u.vendor_id))]
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, vendor_name')
    .in('id', vendorIds)

  const vendorNameById: Record<string, string> = {}
  profiles?.forEach(p => { vendorNameById[p.id] = p.vendor_name ?? 'Unknown' })

  const vendorByUpload: Record<string, string> = {}
  uploads.forEach(u => { vendorByUpload[u.id] = u.vendor_id })

  // Fetch all upload rows
  const uploadIds = uploads.map(u => u.id)
  const { data: rows } = await admin
    .from('vendor_upload_rows')
    .select('id, upload_id, vendor_item_number, item_name, unit_size, price')
    .in('upload_id', uploadIds)
    .order('item_name')

  if (!rows || rows.length === 0) {
    return NextResponse.json({ groups: [] })
  }

  // Build a row lookup keyed by row ID
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
  if (!apiKey) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 500 })
  }

  const client = new Anthropic({ apiKey })

  const vendorList = vendorIds.map(id => vendorNameById[id]).join(', ')

  // idByIndex[globalIdx] → UUID — shared across all chunks
  const idByIndex: string[] = rows.map(r => r.id)

  const CHUNK_SIZE = 150  // items per AI call — keeps output well under 16K tokens

  const systemPrompt = `You are grouping food and beverage supply items from multiple vendor order guides for a restaurant called Old City Hall BBQ.

Your job: group items that refer to the SAME product (even if named differently) into one group with a clean common name.

Rules:
- Match items that OCH would choose ONE vendor to supply (competing products for the same use)
- A clean common name is short, professional, readable: "Shredded Mozzarella", not "MOZZ SHRD WM 6/5LB BLKHD"
- If only one vendor carries something, it still gets its own group (with one rowId)
- Every single index in the input MUST appear in exactly one group — do not skip any
- rowIds in output are the INTEGER INDICES from the input (not UUIDs)
- Vendors in this upload: ${vendorList}`

  // Split into alphabetically-ordered chunks so similar items from different vendors
  // (which sort nearby) appear in the same chunk and get matched.
  const chunks: typeof rows[] = []
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    chunks.push(rows.slice(i, i + CHUNK_SIZE))
  }

  type RawGroup = { commonName: string; rowIds: (string | number)[] }

  // Process all chunks in parallel
  const chunkGroupsArray = await Promise.all(
    chunks.map(async (chunk, chunkIdx) => {
      const offset = chunkIdx * CHUNK_SIZE
      const itemsText = chunk
        .map((r, localIdx) => {
          const globalIdx = offset + localIdx
          const v = rowById[r.id]
          const vendor = v.vendorName.slice(0, 12)
          const parts = [`${globalIdx}`, `[${vendor}]`, `"${v.itemName}"`]
          if (v.unitSize) parts.push(v.unitSize)
          return parts.join(' | ')
        })
        .join('\n')

      const fallback = (): RawGroup[] =>
        chunk.map((r, localIdx) => ({
          commonName: rowById[r.id]?.itemName ?? '—',
          rowIds: [offset + localIdx],
        }))

      let chunkResp
      try {
        chunkResp = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 8000,
          system: systemPrompt,
          tools: [GROUP_TOOL],
          tool_choice: { type: 'tool', name: 'group_vendor_items' },
          messages: [{
            role: 'user',
            content: `Group these ${chunk.length} items (chunk ${chunkIdx + 1}/${chunks.length}):\n\n${itemsText}`,
          }],
        })
      } catch (err) {
        console.error(`[ai-match] Chunk ${chunkIdx + 1} API error:`, err instanceof Error ? err.message : err)
        return fallback()
      }

      if (chunkResp.stop_reason === 'max_tokens') {
        console.error(`[ai-match] Chunk ${chunkIdx + 1} truncated`)
        return fallback()
      }

      const toolUse = chunkResp.content.find(b => b.type === 'tool_use') as
        | { type: 'tool_use'; input: { groups: RawGroup[] } }
        | undefined

      if (!toolUse?.input?.groups || !Array.isArray(toolUse.input.groups)) {
        console.error(`[ai-match] Chunk ${chunkIdx + 1} malformed:`, JSON.stringify(chunkResp.content).slice(0, 500))
        return fallback()
      }

      console.log(`[ai-match] Chunk ${chunkIdx + 1}/${chunks.length}: ${toolUse.input.groups.length} groups from ${chunk.length} items`)
      return toolUse.input.groups
    })
  )

  const rawGroups = chunkGroupsArray.flat()

  // Claude returns integer indices; map back to real UUIDs then look up vendor items
  const groups: MatchGroup[] = rawGroups
    .map(g => {
      const vendorItems = g.rowIds
        .map(rawId => {
          // Accept both numeric strings ("42") and already-correct UUIDs (fallback)
          const idx = Number(rawId)
          const uuid = (!isNaN(idx) && idx >= 0 && idx < idByIndex.length)
            ? idByIndex[idx]
            : String(rawId)
          return rowById[uuid]
        })
        .filter(Boolean)
      return {
        commonName: g.commonName,
        isMatched: vendorItems.length > 1,
        vendorItems,
      }
    })
    .filter(g => g.vendorItems.length > 0)
    .sort((a, b) => {
      // Matched items first, then alphabetical
      if (a.isMatched !== b.isMatched) return a.isMatched ? -1 : 1
      return a.commonName.localeCompare(b.commonName)
    })

  return NextResponse.json({ groups })
}
