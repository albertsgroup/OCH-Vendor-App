import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ADMIN_USER_ID = '04531664-68f8-4353-8306-ea5818017778'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.id !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { vendor_id, vendor_item_number, internal_item_id } = body as {
    vendor_id: string
    vendor_item_number: string
    internal_item_id: string | null
  }

  if (!vendor_id || !vendor_item_number) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const admin = createAdminClient()

  if (internal_item_id === null) {
    // Remove mapping
    await admin
      .from('vendor_item_mappings')
      .delete()
      .eq('vendor_id', vendor_id)
      .eq('vendor_item_number', vendor_item_number)

    // Clear internal_item_id on all matching upload rows
    const { data: vendorUploads } = await admin
      .from('vendor_uploads')
      .select('id')
      .eq('vendor_id', vendor_id)

    if (vendorUploads && vendorUploads.length > 0) {
      const uploadIds = vendorUploads.map(u => u.id)
      await admin
        .from('vendor_upload_rows')
        .update({ internal_item_id: null })
        .in('upload_id', uploadIds)
        .eq('vendor_item_number', vendor_item_number)
    }

    return NextResponse.json({ ok: true })
  }

  // Upsert the mapping
  const { error: mapErr } = await admin
    .from('vendor_item_mappings')
    .upsert(
      { vendor_id, vendor_item_number, internal_item_id },
      { onConflict: 'vendor_id,vendor_item_number' }
    )

  if (mapErr) {
    return NextResponse.json({ error: mapErr.message }, { status: 500 })
  }

  // Apply mapping to all existing rows for this vendor + vendor_item_number
  const { data: uploads } = await admin
    .from('vendor_uploads')
    .select('id')
    .eq('vendor_id', vendor_id)

  if (uploads && uploads.length > 0) {
    const uploadIds = uploads.map(u => u.id)
    await admin
      .from('vendor_upload_rows')
      .update({ internal_item_id })
      .in('upload_id', uploadIds)
      .eq('vendor_item_number', vendor_item_number)
  }

  return NextResponse.json({ ok: true })
}
