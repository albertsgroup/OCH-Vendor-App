'use client'

import { useState } from 'react'
import type { CartItem } from '@/types/database'

interface Props {
  items: CartItem[]
  selectedWeek: string
  onUpdateQuantity: (rowId: string, quantity: number) => void
  onRemove: (rowId: string) => void
  onClear: () => void
}

export default function ViewCart({ items, selectedWeek, onUpdateQuantity, onRemove, onClear }: Props) {
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)

  const grandTotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0)

  // Group by vendor
  const vendorIds = [...new Set(items.map(i => i.vendorId))]
  const byVendor: Record<string, CartItem[]> = {}
  items.forEach(i => {
    if (!byVendor[i.vendorId]) byVendor[i.vendorId] = []
    byVendor[i.vendorId].push(i)
  })

  async function handleExportCSV() {
    setExporting('csv')
    const { exportCartCSV } = await import('@/lib/export/csv')
    exportCartCSV(items, selectedWeek)
    setExporting(null)
  }

  async function handleExportPDF() {
    setExporting('pdf')
    const { exportCartPDF } = await import('@/lib/export/pdf')
    await exportCartPDF(items, selectedWeek)
    setExporting(null)
  }

  if (items.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="text-4xl mb-3 opacity-20">🛒</div>
        <p className="font-heading text-primary text-lg font-bold">Your cart is empty</p>
        <p className="text-light-grey-400 text-sm mt-1">
          Go to <strong>View 1 — By Vendor</strong> and click <strong>+</strong> next to any item to add it here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Cart header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-sm font-semibold text-primary">
            {items.length} item{items.length !== 1 ? 's' : ''} from {vendorIds.length} vendor{vendorIds.length !== 1 ? 's' : ''}
          </span>
          <span className="text-light-grey-300 mx-2">·</span>
          <span className="text-sm font-bold font-heading text-primary">
            Grand Total: ${grandTotal.toFixed(2)}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExportCSV}
            disabled={!!exporting}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
          >
            {exporting === 'csv' ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            )}
            Download CSV
          </button>
          <button
            onClick={handleExportPDF}
            disabled={!!exporting}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
          >
            {exporting === 'pdf' ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            )}
            Download PDF
          </button>
          <button
            onClick={onClear}
            className="btn-secondary text-xs px-3 py-1.5 text-red-500 hover:bg-red-50 border-red-200"
          >
            Clear Cart
          </button>
        </div>
      </div>

      {/* Vendor sections */}
      {vendorIds.map(vendorId => {
        const vendorItems = byVendor[vendorId]
        const vendorTotal = vendorItems.reduce((sum, i) => sum + i.price * i.quantity, 0)
        const vendorName = vendorItems[0].vendorName

        return (
          <div key={vendorId} className="card overflow-hidden">
            {/* Vendor header */}
            <div className="px-5 py-3 bg-secondary-100 border-b border-secondary-300 flex items-center justify-between gap-2">
              <h3 className="font-heading font-bold text-primary">{vendorName}</h3>
              <div className="text-right">
                <p className="text-xs text-light-grey-400 uppercase tracking-widest font-semibold mb-0.5">Subtotal</p>
                <p className="text-lg font-bold font-heading text-primary">${vendorTotal.toFixed(2)}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-light-grey-200">
                    <th className="th w-32">Item #</th>
                    <th className="th">Item Name</th>
                    <th className="th w-28">Unit Size</th>
                    <th className="th w-28 text-right">Case Price</th>
                    <th className="th w-32 text-center">Qty</th>
                    <th className="th w-28 text-right">Line Total</th>
                    <th className="th w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-light-grey-100">
                  {vendorItems.map(item => (
                    <tr key={item.rowId} className="hover:bg-secondary-50">
                      <td className="td font-mono text-light-grey-400 text-xs">
                        {item.vendorItemNumber ?? '—'}
                      </td>
                      <td className="td">
                        <p className="font-medium text-och-black">{item.itemName}</p>
                      </td>
                      <td className="td text-xs text-light-grey-400">
                        {item.unitSize ?? '—'}
                      </td>
                      <td className="td text-right tabular-nums text-och-black">
                        ${item.price.toFixed(2)}
                      </td>
                      <td className="td">
                        {/* Quantity stepper */}
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => item.quantity > 1
                              ? onUpdateQuantity(item.rowId, item.quantity - 1)
                              : onRemove(item.rowId)
                            }
                            className="w-6 h-6 rounded border border-light-grey-300 flex items-center justify-center text-light-grey-400 hover:border-primary hover:text-primary transition-colors text-sm font-bold"
                          >
                            −
                          </button>
                          <span className="w-8 text-center tabular-nums font-semibold text-och-black text-sm">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => onUpdateQuantity(item.rowId, item.quantity + 1)}
                            className="w-6 h-6 rounded border border-light-grey-300 flex items-center justify-center text-light-grey-400 hover:border-primary hover:text-primary transition-colors text-sm font-bold"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="td text-right tabular-nums font-semibold text-primary">
                        ${(item.price * item.quantity).toFixed(2)}
                      </td>
                      <td className="td text-center">
                        <button
                          onClick={() => onRemove(item.rowId)}
                          className="text-light-grey-300 hover:text-red-400 transition-colors"
                          title="Remove"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-light-grey-200 bg-secondary-50">
                    <td colSpan={5} className="td text-xs text-light-grey-500 font-semibold">
                      {vendorName} — {vendorItems.length} item{vendorItems.length !== 1 ? 's' : ''}
                    </td>
                    <td className="td text-right font-bold font-heading text-primary tabular-nums">
                      ${vendorTotal.toFixed(2)}
                    </td>
                    <td className="td" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })}

      {/* Grand total footer */}
      <div className="card px-5 py-4 flex items-center justify-between bg-primary text-white">
        <span className="font-sans text-sm font-semibold tracking-wide uppercase opacity-80">Grand Total</span>
        <span className="font-heading text-2xl font-bold">${grandTotal.toFixed(2)}</span>
      </div>
    </div>
  )
}
