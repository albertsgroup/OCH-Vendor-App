'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentWeekStart, formatWeekRange } from '@/lib/utils/week'
import UploadForm from '@/components/vendor/UploadForm'
import { breakdownPrice, extractUnitSizeFromName } from '@/lib/utils/parseUnitSize'
import type { VendorUpload, VendorUploadRow } from '@/types/database'

type UploadWithRows = VendorUpload & { rows: VendorUploadRow[] }

export default function VendorDashboard() {
  const [vendorName, setVendorName] = useState<string>('')
  const [upload, setUpload] = useState<UploadWithRows | null>(null)
  const [loading, setLoading] = useState(true)

  const weekStart = getCurrentWeekStart()
  const weekLabel = formatWeekRange(weekStart)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: profile }, { data: uploadData }] = await Promise.all([
        supabase.from('profiles').select('vendor_name').eq('id', user.id).single(),
        supabase.from('vendor_uploads')
          .select('*')
          .eq('vendor_id', user.id)
          .eq('week_start', weekStart)
          .single(),
      ])

      setVendorName(profile?.vendor_name ?? '')

      if (uploadData) {
        const { data: rows } = await supabase
          .from('vendor_upload_rows')
          .select('*')
          .eq('upload_id', uploadData.id)
          .order('sort_order')

        setUpload({ ...uploadData, rows: rows ?? [] })
      }

      setLoading(false)
    }
    load()
  }, [weekStart])

  function handleUploadComplete(result: { row_count: number; auto_matched?: number; needs_review?: number }) {
    // Reload the upload data after successful upload
    async function reload() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: uploadData } = await supabase
        .from('vendor_uploads')
        .select('*')
        .eq('vendor_id', user.id)
        .eq('week_start', weekStart)
        .single()

      if (uploadData) {
        const { data: rows } = await supabase
          .from('vendor_upload_rows')
          .select('*')
          .eq('upload_id', uploadData.id)
          .order('sort_order')

        setUpload({ ...uploadData, rows: rows ?? [] })
      }
    }
    reload()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <svg className="w-6 h-6 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-heading text-primary">
          Welcome{vendorName ? `, ${vendorName}` : ''}
        </h1>
        <p className="text-light-grey-500 mt-1 text-sm">Week of {weekLabel}</p>
      </div>

      {/* Upload section */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">This Week&apos;s Order Guide</h2>
        <p className="text-sm text-gray-500 mb-5">
          Upload your order guide for the week of {weekLabel}. CSV, XLSX, or XLS files are accepted.
          Your file should include columns for item number, description, and price.
        </p>

        <UploadForm
          weekStart={weekStart}
          currentUpload={upload}
          onUploadComplete={handleUploadComplete}
        />
      </div>

      {/* Preview of uploaded items */}
      {upload && upload.rows.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              Uploaded Items ({upload.rows.length})
            </h2>
            <span className="text-xs text-gray-400">{upload.file_name}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="th w-32">Your Item #</th>
                  <th className="th">Description</th>
                  <th className="th w-20 text-center">Pack/Case</th>
                  <th className="th w-28 text-right">Size & Unit</th>
                  <th className="th w-28 text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {upload.rows.map(row => {
                  const effectiveUnitSize = row.unit_size || extractUnitSizeFromName(row.item_name)
                  const bd = breakdownPrice(Number(row.price), effectiveUnitSize)
                  const packDisplay = bd?.packCount != null
                    ? String(bd.packCount % 1 === 0 ? bd.packCount : bd.packCount.toFixed(1))
                    : null
                  const sizeDisplay = bd
                    ? bd.packSize != null && bd.packSizeUnit
                      ? `${bd.packSize % 1 === 0 ? bd.packSize : bd.packSize.toFixed(1)} ${bd.packSizeUnit}`
                      : bd.unitLabel === '$/lb'
                        ? `${bd.totalInCase % 1 === 0 ? bd.totalInCase : bd.totalInCase.toFixed(1)} lb`
                        : `${bd.totalInCase} ct`
                    : null
                  return (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="td font-mono text-gray-500 text-xs">
                        {row.vendor_item_number ?? '—'}
                      </td>
                      <td className="td font-medium">{row.item_name ?? '—'}</td>
                      <td className="td text-center tabular-nums text-gray-600">
                        {packDisplay ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="td text-right tabular-nums text-gray-600">
                        {sizeDisplay ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="td text-right tabular-nums font-semibold text-gray-800">
                        ${Number(row.price).toFixed(2)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex justify-end text-xs text-gray-500">
            <span>
              Total: <strong className="text-gray-700">
                ${upload.rows.reduce((sum, r) => sum + Number(r.price), 0).toFixed(2)}
              </strong>
            </span>
          </div>
        </div>
      )}

      {/* No upload yet */}
      {!upload && (
        <div className="card p-8 text-center">
          <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-gray-500 font-medium">No order guide uploaded yet</p>
          <p className="text-gray-400 text-sm mt-1">Use the upload area above to submit your pricing for this week.</p>
        </div>
      )}
    </div>
  )
}
