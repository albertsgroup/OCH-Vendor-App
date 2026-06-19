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
              description: 'Row IDs that belong to this group (one per vendor max)',
              items: { type: 'string' },
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

  const itemsText = rows
    .map(r => {
      const v = rowById[r.id]
      const parts = [`ID:${r.id}`, `"${v.itemName}"`]
      if (v.unitSize) parts.push(v.unitSize)
      return parts.join(' | ')
    })
    .join('\n')

  let response
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: `You are grouping food and beverage supply items from multiple vendor order guides for a restaurant called Old City Hall BBQ.

Your job: group items that refer to the SAME product (even if named differently) into one group with a clean common name.

Rules:
- Match items that OCH would choose ONE vendor to supply (competing products for the same use)
- A clean common name is short, professional, readable: "Shredded Mozzarella", not "MOZZ SHRD WM 6/5LB BLKHD"
- If only one vendor carries something, it still gets its own group (with one rowId)
- Every single row ID in the input MUST appear in exactly one group — do not skip any
- Vendors in this upload: ${vendorList}`,
      tools: [GROUP_TOOL],
      tool_choice: { type: 'tool', name: 'group_vendor_items' },
      messages: [{
        role: 'user',
        content: `Group these ${rows.length} items from this week's uploads:\n\n${itemsText}`,
      }],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[ai-match] Anthropic API error:', message)
    return NextResponse.json({ error: `AI API error: ${message}` }, { status: 500 })
  }

  const toolUse = response.content.find(b => b.type === 'tool_use') as
    | { type: 'tool_use'; input: { groups: Array<{ commonName: string; rowIds: string[] }> } }
    | undefined

  if (!toolUse) {
    return NextResponse.json({ error: 'AI did not return groups' }, { status: 500 })
  }

  const rawGroups = toolUse.input?.groups
  if (!rawGroups || !Array.isArray(rawGroups)) {
    console.error('[ai-match] Malformed tool input:', JSON.stringify(toolUse.input))
    return NextResponse.json({
      error: 'AI returned malformed groups',
      debug: { stopReason: response.stop_reason, inputKeys: Object.keys(toolUse.input ?? {}), inputSample: JSON.stringify(toolUse.input).slice(0, 500) },
    }, { status: 500 })
  }

  // Build MatchGroup[], filtering out any unknown row IDs
  const groups: MatchGroup[] = rawGroups
    .map(g => {
      const vendorItems = g.rowIds
        .map(id => rowById[id])
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
