/**
 * Admin: confirm or override an AI item match.
 *
 * Actions:
 *   match   — link this row (and all future rows with same vendor item #) to an existing internal item
 *   new     — create a new internal item (OCH####) and link to it
 *   dismiss — mark as resolved without linking (e.g. item to skip)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateOCHNumber } from '@/lib/ai/matchItems'

const ADMIN_USER_ID = '04531664-68f8-4353-8306-ea5818017778'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json() as {
    row_id: string
    action: 'match' | 'new' | 'dismiss'
    internal_item_id?: string   // for 'match'
    new_item_name?: string      // for 'new'
  }

  const { row_id, action } = body
  if (!row_id || !action) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Fetch the row to get vendor_id and vendor_item_number
  const { data: row, error: rowErr } = await admin
    .from('vendor_upload_rows')
    .select('id, vendor_item_number, item_name, upload_id')
    .eq('id', row_id)
    .single()

  if (rowErr || !row) {
    return NextResponse.json({ error: 'Row not found' }, { status: 404 })
  }

  const { data: upload } = await admin
    .from('vendor_uploads')
    .select('vendor_id')
    .eq('id', row.upload_id)
    .single()

  if (!upload) {
    return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
  }

  const vendorId = upload.vendor_id

  // ── action: dismiss (no internal item assigned) ────────
  if (action === 'dismiss') {
    await admin
      .from('vendor_upload_rows')
      .update({ needs_admin_review: true, review_resolved: true })
      .eq('id', row_id)
    return NextResponse.json({ ok: true })
  }

  // ── action: match (link to existing internal item) ─────
  if (action === 'match') {
    const { internal_item_id } = body
    if (!internal_item_id) {
      return NextResponse.json({ error: 'internal_item_id required for match action' }, { status: 400 })
    }

    // Update this row
    await admin
      .from('vendor_upload_rows')
      .update({ internal_item_id, needs_admin_review: true, review_resolved: true })
      .eq('id', row_id)

    // Save as a permanent mapping so future uploads auto-match
    if (row.vendor_item_number) {
      await admin
        .from('vendor_item_mappings')
        .upsert(
          { vendor_id: vendorId, vendor_item_number: row.vendor_item_number, internal_item_id },
          { onConflict: 'vendor_id,vendor_item_number' }
        )

      // Apply mapping to ALL other existing rows for this vendor + item number
      const { data: uploads } = await admin
        .from('vendor_uploads')
        .select('id')
        .eq('vendor_id', vendorId)

      if (uploads && uploads.length > 0) {
        await admin
          .from('vendor_upload_rows')
          .update({ internal_item_id, review_resolved: true })
          .in('upload_id', uploads.map(u => u.id))
          .eq('vendor_item_number', row.vendor_item_number)
          .neq('id', row_id)
      }
    }

    return NextResponse.json({ ok: true, internal_item_id })
  }

  // ── action: new (create a new internal item) ──────────
  if (action === 'new') {
    const { new_item_name } = body
    const itemName = (new_item_name ?? row.item_name ?? 'Unknown Item').trim()

    if (!itemName) {
      return NextResponse.json({ error: 'new_item_name is required' }, { status: 400 })
    }

    // Generate unique OCH number
    const { data: existingItems } = await admin.from('items').select('item_number')
    const existingNumbers = existingItems?.map(i => i.item_number) ?? []
    const itemNumber = await generateOCHNumber(existingNumbers)

    // Create the new internal item
    const { data: newItem, error: createErr } = await admin
      .from('items')
      .insert({ item_number: itemNumber, item_name: itemName, is_active: true })
      .select('id, item_number, item_name')
      .single()

    if (createErr || !newItem) {
      console.error('Create item error:', createErr)
      return NextResponse.json({ error: 'Failed to create internal item' }, { status: 500 })
    }

    // Update this row
    await admin
      .from('vendor_upload_rows')
      .update({ internal_item_id: newItem.id, needs_admin_review: true, review_resolved: true })
      .eq('id', row_id)

    // Save permanent mapping
    if (row.vendor_item_number) {
      await admin
        .from('vendor_item_mappings')
        .upsert(
          { vendor_id: vendorId, vendor_item_number: row.vendor_item_number, internal_item_id: newItem.id },
          { onConflict: 'vendor_id,vendor_item_number' }
        )
    }

    return NextResponse.json({
      ok: true,
      internal_item_id: newItem.id,
      item_number: newItem.item_number,
      item_name: newItem.item_name,
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
