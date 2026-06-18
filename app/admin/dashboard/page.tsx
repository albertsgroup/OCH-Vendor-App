import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentWeekStart, getPreviousWeeks, formatWeekRange } from '@/lib/utils/week'
import DashboardClient from '@/components/admin/DashboardClient'
import type { GroupedRow, VendorSummary } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const { week } = await searchParams
  await createClient() // ensure session check

  const admin = createAdminClient()
  const currentWeek = getCurrentWeekStart()
  const selectedWeek = week ?? currentWeek
  const availableWeeks = getPreviousWeeks(13) // current + 12 prior

  // Fetch all active vendors
  const { data: vendorProfiles } = await admin
    .from('profiles')
    .select('id, vendor_name')
    .eq('role', 'vendor')
    .eq('is_active', true)
    .order('vendor_name')

  // Fetch all uploads for the selected week
  const { data: uploads } = await admin
    .from('vendor_uploads')
    .select('*')
    .eq('week_start', selectedWeek)

  // Build a map: vendor_id → upload
  const uploadByVendor: Record<string, typeof uploads extends (infer T)[] | null ? T : never> = {}
  uploads?.forEach(u => { uploadByVendor[u.vendor_id] = u })

  // Fetch all upload rows for this week
  const uploadIds = uploads?.map(u => u.id) ?? []
  const { data: uploadRows } = uploadIds.length > 0
    ? await admin
        .from('vendor_upload_rows')
        .select('id, upload_id, vendor_item_number, item_name, unit_size, price')
        .in('upload_id', uploadIds)
        .order('sort_order')
    : { data: [] }

  // Map: upload_id → vendor_id
  const vendorByUpload: Record<string, string> = {}
  uploads?.forEach(u => { vendorByUpload[u.id] = u.vendor_id })

  // Map: vendor_id → vendor_name
  const vendorNameById: Record<string, string> = {}
  vendorProfiles?.forEach(v => { vendorNameById[v.id] = v.vendor_name ?? 'Unknown' })

  // ---- Build VendorSummary list ----
  const vendors: VendorSummary[] = (vendorProfiles ?? []).map(vendor => {
    const upload = uploadByVendor[vendor.id]
    const rows = uploadRows?.filter(r => vendorByUpload[r.upload_id] === vendor.id) ?? []
    const total = rows.reduce((sum, r) => sum + Number(r.price), 0)

    return {
      vendor_id: vendor.id,
      vendor_name: vendor.vendor_name ?? 'Unknown',
      upload_id: upload?.id ?? null,
      file_name: upload?.file_name ?? null,
      uploaded_at: upload?.uploaded_at ?? null,
      row_count: upload?.row_count ?? 0,
      total_spend: total,
    }
  })

  // ---- Build GroupedRow list (View 1) ----
  const groupedRows: GroupedRow[] = (uploadRows ?? []).map(row => {
    const vendorId = vendorByUpload[row.upload_id]

    return {
      id: row.id,
      vendor_id: vendorId,
      vendor_name: vendorNameById[vendorId] ?? 'Unknown',
      vendor_item_number: row.vendor_item_number,
      item_name: row.item_name,
      unit_size: (row as { unit_size?: string | null }).unit_size ?? null,
      price: Number(row.price),
      internal_item_id: null,
      internal_item_number: null,
      internal_item_name: null,
    }
  })

  return (
    <DashboardClient
      groupedRows={groupedRows}
      comparisonRows={[]}
      vendors={vendors}
      availableWeeks={availableWeeks}
      selectedWeek={selectedWeek}
      currentWeek={currentWeek}
      weekLabel={formatWeekRange(selectedWeek)}
    />
  )
}
