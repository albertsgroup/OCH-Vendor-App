import { createClient } from '@/lib/supabase/server'
import { getPreviousWeeks, formatWeekRange } from '@/lib/utils/week'

export const dynamic = 'force-dynamic'

export default async function VendorHistory() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const weeks = getPreviousWeeks(13).slice(1) // last 12 completed weeks (skip current)

  const { data: uploads } = await supabase
    .from('vendor_uploads')
    .select('*')
    .eq('vendor_id', user!.id)
    .in('week_start', weeks)
    .order('week_start', { ascending: false })

  // Fetch rows for all found uploads
  const uploadIds = uploads?.map(u => u.id) ?? []
  let allRows: Array<{
    id: string; upload_id: string; vendor_item_number: string | null;
    item_name: string | null; price: number; internal_item_id: string | null; sort_order: number
  }> = []
  if (uploadIds.length > 0) {
    const { data } = await supabase
      .from('vendor_upload_rows')
      .select('*')
      .in('upload_id', uploadIds)
      .order('sort_order')
    allRows = data ?? []
  }

  // Group rows by upload_id
  const rowsByUpload: Record<string, typeof allRows> = {}
  allRows?.forEach(row => {
    if (!rowsByUpload[row.upload_id]) rowsByUpload[row.upload_id] = []
    rowsByUpload[row.upload_id]!.push(row)
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Upload History</h1>
        <p className="text-gray-500 mt-1">Your order guides from the last 12 weeks — read-only</p>
      </div>

      {(!uploads || uploads.length === 0) ? (
        <div className="card p-8 text-center">
          <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-500 font-medium">No upload history yet.</p>
          <p className="text-gray-400 text-sm mt-1">Previous weeks&apos; uploads will appear here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {uploads.map(upload => {
            const rows = rowsByUpload[upload.id] ?? []
            const total = rows.reduce((sum, r) => sum + Number(r.price), 0)

            return (
              <div key={upload.id} className="card overflow-hidden">
                {/* Week header */}
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-800">
                      Week of {formatWeekRange(upload.week_start)}
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {upload.file_name} · Uploaded {new Date(upload.uploaded_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric'
                      })}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold text-gray-800">${total.toFixed(2)}</p>
                    <p className="text-xs text-gray-400">{rows.length} items</p>
                  </div>
                </div>

                {/* Items table */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="th w-32">Your Item #</th>
                        <th className="th">Description</th>
                        <th className="th w-28 text-right">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="td text-center text-gray-400 py-6">No items in this upload.</td>
                        </tr>
                      ) : rows.map(row => (
                        <tr key={row.id} className="hover:bg-gray-50">
                          <td className="td font-mono text-gray-400 text-xs">
                            {row.vendor_item_number ?? '—'}
                          </td>
                          <td className="td font-medium text-gray-800">{row.item_name ?? '—'}</td>
                          <td className="td text-right tabular-nums font-semibold text-gray-800">
                            ${Number(row.price).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
