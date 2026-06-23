'use client'

import { useState, useMemo } from 'react'
import type { GroupedRow, VendorSummary, CartItem } from '@/types/database'
import { breakdownPrice, extractUnitSizeFromName } from '@/lib/utils/parseUnitSize'

interface Props {
  rows: GroupedRow[]
  vendors: VendorSummary[]
  cartItems: CartItem[]
  onAddToCart: (item: CartItem) => void
}

export default function ViewGrouped({ rows, vendors, cartItems, onAddToCart }: Props) {
  const [search, setSearch] = useState('')
  const cartRowIds = new Set(cartItems.map(c => c.rowId))

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(r =>
      r.item_name?.toLowerCase().includes(q) ||
      r.vendor_item_number?.toLowerCase().includes(q)
    )
  }, [rows, search])


  if (vendors.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-light-grey-400">No vendors have uploaded their order guide for this week yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-light-grey-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search items across all vendors…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input pl-9 w-full text-sm"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-light-grey-400 hover:text-primary"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {vendors.map(vendor => {
        const vendorRows = (filteredRows).filter(r => r.vendor_id === vendor.vendor_id)
        const total = vendorRows.reduce((sum, r) => sum + r.price, 0)
        const hasUpload = !!vendor.upload_id

        return (
          <div key={vendor.vendor_id} className="card overflow-hidden">
            {/* Vendor header */}
            <div className="px-5 py-4 bg-secondary-100 border-b border-secondary-300 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-heading font-bold text-primary">{vendor.vendor_name}</h3>
                {hasUpload ? (
                  <p className="text-xs text-light-grey-500 mt-0.5">
                    {vendor.file_name} · {vendor.row_count} items ·{' '}
                    Uploaded {new Date(vendor.uploaded_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                ) : (
                  <p className="text-xs text-red-500 mt-0.5">No order guide uploaded this week</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-light-grey-400 uppercase tracking-widest font-semibold mb-0.5">Potential Spend</p>
                <p className="text-xl font-bold font-heading text-primary">${total.toFixed(2)}</p>
              </div>
            </div>

            {/* Items table */}
            {vendorRows.length === 0 ? (
              <div className="px-5 py-8 text-center text-light-grey-400 text-sm">
                No items for this vendor this week.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-light-grey-200">
                      <th className="th w-32">Item #</th>
                      <th className="th">Item Name / Description</th>
                      <th className="th w-28 text-right">Case Price</th>
                      <th className="th w-32 text-right">Price / unit</th>
                      <th className="th w-16 text-center">Cart</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-light-grey-100">
                    {vendorRows.map(row => {
                      // Use stored unit_size; fall back to extracting from item name for older rows
                      const effectiveUnitSize = row.unit_size || extractUnitSizeFromName(row.item_name)
                      const bd = breakdownPrice(row.price, effectiveUnitSize)
                      const inCart = cartRowIds.has(row.id)

                      return (
                        <tr key={row.id} className="hover:bg-secondary-50">
                          <td className="td font-mono text-light-grey-400 text-xs">
                            {row.vendor_item_number ?? '—'}
                          </td>
                          <td className="td">
                            <div>
                              <p className="font-medium text-och-black">{row.item_name ?? '—'}</p>
                              {effectiveUnitSize && (
                                <p className="text-xs text-light-grey-400 mt-0.5">{effectiveUnitSize}</p>
                              )}
                            </div>
                          </td>
                          <td className="td text-right tabular-nums font-semibold text-och-black">
                            ${row.price.toFixed(2)}
                          </td>
                          <td className="td text-right tabular-nums">
                            {bd !== null ? (
                              <div className="space-y-0.5">
                                {/* Primary: $/lb or $/ct */}
                                <div className="flex items-baseline justify-end gap-1">
                                  <span className="text-primary font-semibold">${bd.perUnit.toFixed(2)}</span>
                                  <span className={`text-[10px] font-semibold px-1 py-px rounded ${bd.unitLabel === '$/lb' ? 'bg-secondary-100 text-primary-300' : 'bg-amber-50 text-amber-700'}`}>
                                    {bd.unitLabel}
                                  </span>
                                </div>
                                {/* Secondary: $/pack breakdown (only when multi-pack) */}
                                {bd.packCount !== null && bd.perPack !== null && bd.perPack !== bd.perUnit && (
                                  <div className="text-xs text-light-grey-500 text-right">
                                    ${bd.perPack.toFixed(2)}/pack
                                    {bd.packSize && bd.packSizeUnit ? ` · ${bd.packSize % 1 === 0 ? bd.packSize : bd.packSize.toFixed(1)} ${bd.packSizeUnit} each` : ''}
                                  </div>
                                )}
                                {/* Tertiary: case totals */}
                                <div className="text-[11px] text-light-grey-300 text-right">
                                  {bd.unitLabel === '$/lb'
                                    ? `${bd.totalInCase % 1 === 0 ? bd.totalInCase : bd.totalInCase.toFixed(1)} lb case`
                                    : `${bd.totalInCase} units/case`}
                                </div>
                              </div>
                            ) : (
                              <span className="text-light-grey-300">—</span>
                            )}
                          </td>
                          <td className="td text-center">
                            {inCart ? (
                              <span
                                className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-100 text-green-700"
                                title="In cart"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              </span>
                            ) : (
                              <button
                                onClick={() => onAddToCart({
                                  rowId: row.id,
                                  vendorId: row.vendor_id,
                                  vendorName: vendor.vendor_name,
                                  vendorItemNumber: row.vendor_item_number,
                                  itemName: row.item_name ?? '—',
                                  unitSize: row.unit_size,
                                  price: row.price,
                                  quantity: 1,
                                })}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-light-grey-300 text-light-grey-400 hover:border-primary hover:text-primary hover:bg-secondary-100 transition-colors"
                                title="Add to cart"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-light-grey-200 bg-secondary-50">
                      <td colSpan={3} className="td text-xs text-light-grey-500 font-semibold">
                        {vendor.vendor_name} — {vendorRows.length} items
                      </td>
                      <td className="td text-right font-bold font-heading text-primary tabular-nums">
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
