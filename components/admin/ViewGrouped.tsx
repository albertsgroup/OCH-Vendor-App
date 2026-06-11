'use client'

import { useState } from 'react'
import type { GroupedRow, VendorSummary, Item } from '@/types/database'

interface Props {
  rows: GroupedRow[]
  vendors: VendorSummary[]
  internalItems: Item[]
  onMapItem: (vendorId: string, vendorItemNumber: string, internalItemId: string | null) => Promise<void>
}

export default function ViewGrouped({ rows, vendors, internalItems, onMapItem }: Props) {
  const [mappingRow, setMappingRow] = useState<string | null>(null) // row id being mapped
  const [pendingMap, setPendingMap] = useState<Record<string, boolean>>({})

  // Group rows by vendor
  const vendorIds = vendors.map(v => v.vendor_id)
  const rowsByVendor: Record<string, GroupedRow[]> = {}
  vendorIds.forEach(id => { rowsByVendor[id] = [] })
  rows.forEach(row => {
    if (rowsByVendor[row.vendor_id]) rowsByVendor[row.vendor_id].push(row)
  })

  async function handleMap(row: GroupedRow, internalItemId: string | null) {
    if (!row.vendor_item_number) return
    setPendingMap(prev => ({ ...prev, [row.id]: true }))
    await onMapItem(row.vendor_id, row.vendor_item_number, internalItemId)
    setPendingMap(prev => ({ ...prev, [row.id]: false }))
    setMappingRow(null)
  }

  if (vendors.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-gray-500">No vendors have uploaded their order guide for this week yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {vendors.map(vendor => {
        const vendorRows = rowsByVendor[vendor.vendor_id] ?? []
        const total = vendorRows.reduce((sum, r) => sum + r.price, 0)
        const hasUpload = !!vendor.upload_id

        return (
          <div key={vendor.vendor_id} className="card overflow-hidden">
            {/* Vendor header */}
            <div className="px-5 py-4 bg-primary-50 border-b border-primary-100 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-primary">{vendor.vendor_name}</h3>
                {hasUpload ? (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {vendor.file_name} · {vendor.row_count} items ·{' '}
                    Uploaded {new Date(vendor.uploaded_at!).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric'
                    })}
                  </p>
                ) : (
                  <p className="text-xs text-red-500 mt-0.5">No order guide uploaded this week</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Potential Spend</p>
                <p className="text-xl font-bold text-primary">${total.toFixed(2)}</p>
              </div>
            </div>

            {/* Items table */}
            {vendorRows.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">
                No items for this vendor this week.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="th w-32">Vendor Item #</th>
                      <th className="th w-36">Internal Item #</th>
                      <th className="th">Item Name / Description</th>
                      <th className="th w-28 text-right">Price</th>
                      <th className="th w-36">Match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {vendorRows.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="td font-mono text-gray-500 text-xs">
                          {row.vendor_item_number ?? '—'}
                        </td>
                        <td className="td font-mono text-xs font-semibold text-primary">
                          {row.internal_item_number ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="td">
                          <div>
                            <p className="font-medium text-gray-900">{row.item_name ?? '—'}</p>
                            {row.internal_item_name && row.internal_item_name !== row.item_name && (
                              <p className="text-xs text-gray-400 mt-0.5">→ {row.internal_item_name}</p>
                            )}
                          </div>
                        </td>
                        <td className="td text-right tabular-nums font-semibold text-gray-800">
                          ${row.price.toFixed(2)}
                        </td>
                        <td className="td">
                          {mappingRow === row.id ? (
                            <div className="flex items-center gap-1">
                              <select
                                autoFocus
                                disabled={pendingMap[row.id]}
                                className="input text-xs py-1 px-2 flex-1"
                                defaultValue={row.internal_item_id ?? ''}
                                onChange={e => handleMap(row, e.target.value || null)}
                                onBlur={() => setMappingRow(null)}
                              >
                                <option value="">— No match —</option>
                                {internalItems.map(item => (
                                  <option key={item.id} value={item.id}>
                                    {item.item_number} — {item.item_name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : row.internal_item_id ? (
                            <button
                              onClick={() => setMappingRow(row.id)}
                              className="badge-success cursor-pointer hover:bg-green-200 transition-colors"
                              title="Click to remap"
                            >
                              Matched
                            </button>
                          ) : (
                            <button
                              onClick={() => setMappingRow(row.id)}
                              className="badge-gray cursor-pointer hover:bg-gray-200 transition-colors"
                              title="Click to assign internal item"
                            >
                              Map item
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td colSpan={3} className="td text-xs text-gray-500 font-semibold">
                        {vendor.vendor_name} — {vendorRows.length} items
                      </td>
                      <td className="td text-right font-bold text-primary tabular-nums">
                        ${total.toFixed(2)}
                      </td>
                      <td className="td" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
