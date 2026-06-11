import { createAdminClient } from '@/lib/supabase/admin'
import MappingQueue from '@/components/admin/MappingQueue'
import type { QueueRow } from '@/components/admin/MappingQueue'

export const dynamic = 'force-dynamic'

export default async function MappingPage() {
  const admin = createAdminClient()

  // Fetch all unresolved review rows
  const { data: reviewRows } = await admin
    .from('vendor_upload_rows')
    .select(`
      id,
      vendor_item_number,
      item_name,
      price,
      ai_confidence,
      ai_suggested_item_id,
      ai_match_reason,
      upload_id,
      vendor_uploads!inner (
        vendor_id,
        week_start,
        profiles!vendor_id (
          vendor_name
        )
      )
    `)
    .eq('needs_admin_review', true)
    .eq('review_resolved', false)
    .order('upload_id')

  // Fetch all internal items for the mapping dropdowns
  const { data: internalItems } = await admin
    .from('items')
    .select('id, item_number, item_name, is_active, created_at')
    .eq('is_active', true)
    .order('item_number')

  // Shape into QueueRow[]
  const queueRows: QueueRow[] = (reviewRows ?? []).map(row => {
    const upload = row.vendor_uploads as unknown as {
      vendor_id: string
      week_start: string
      profiles: { vendor_name: string | null }
    }

    return {
      id: row.id,
      vendor_name: upload.profiles?.vendor_name ?? 'Unknown',
      vendor_id: upload.vendor_id,
      vendor_item_number: row.vendor_item_number,
      item_name: row.item_name,
      price: Number(row.price),
      ai_confidence: row.ai_confidence,
      ai_suggested_item_id: row.ai_suggested_item_id,
      ai_match_reason: row.ai_match_reason,
      week_start: upload.week_start,
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Item Mapping Review</h1>
        <p className="text-gray-500 mt-1">
          {queueRows.length > 0
            ? `${queueRows.length} vendor item${queueRows.length !== 1 ? 's' : ''} need your review`
            : 'All vendor items have been matched'}
        </p>
      </div>

      {queueRows.length > 0 && (
        <div className="card p-4 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-800">
            <strong>How this works:</strong> Our AI tried to match each vendor item to your internal catalogue.
            Items listed here either had a low-confidence match or are brand new.
            For each item, choose to <strong>match it to an existing item</strong> (so all vendors&apos; versions map to the same internal name)
            or <strong>create a new item</strong> (generates an OCH number and a common name you define).
            Once confirmed, future uploads from that vendor auto-match automatically.
          </p>
        </div>
      )}

      <MappingQueue
        rows={queueRows}
        internalItems={internalItems ?? []}
        onResolved={() => {}}
      />
    </div>
  )
}
