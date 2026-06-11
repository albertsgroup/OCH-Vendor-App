'use client'

import type { ComparisonRow, VendorSummary } from '@/types/database'

interface Props {
  rows: ComparisonRow[]
  vendors: VendorSummary[]
}

export default function ViewComparison({ rows, vendors }: Props) {
  if (vendors.length === 0 || rows.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-gray-500 font-medium">No comparable data yet.</p>
        <p className="text-gray-400 text-sm mt-2">
          This view shows items that have been matched across vendor uploads.
          Upload order guides and use &quot;Map item&quot; in View 1 to link vendor items to internal catalogue items.
        </p>
      </div>
    )
  }

  // Per-vendor totals (sum of their prices for matched items only)
  const vendorTotals: Record<string, number> = {}
  vendors.forEach(v => { vendorTotals[v.vendor_id] = 0 })
  rows.forEach(row => {
    vendors.forEach(v => {
      const price = row.prices[v.vendor_id]
      if (price !== null && price !== undefined) {
        vendorTotals[v.vendor_id] += price
      }
    })
  })

  // Lowest possible spend (buy cheapest for every item)
  const lowestTotal = rows.reduce((sum, row) => sum + row.lowest_price, 0)

  return (
    <div className="space-y-4">
      {/* Spend summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {vendors.map(vendor => (
          <div key={vendor.vendor_id} className="card p-3">
            <p className="text-xs font-semibold text-gray-500 truncate">{vendor.vendor_name}</p>
            <p className="text-lg font-bold text-primary mt-1">${vendorTotals[vendor.vendor_id].toFixed(2)}</p>
            <p className="text-xs text-gray-400">if buying all from them</p>
          </div>
        ))}
        <div className="card p-3 border-green-200 bg-green-50">
          <p className="text-xs font-semibold text-green-700">Lowest Possible</p>
          <p className="text-lg font-bold text-green-700 mt-1">${lowestTotal.toFixed(2)}</p>
          <p className="text-xs text-green-600">buying cheapest per item</p>
        </div>
      </div>

      {/* Comparison table */}
      <div className="table-container">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="th w-28">Internal #</th>
                <th className="th">Item Name</th>
                {vendors.map(v => (
                  <th key={v.vendor_id} className="th w-32 text-right">{v.vendor_name}</th>
                ))}
                <th className="th w-28 text-right text-green-700">Lowest</th>
                <th className="th w-32">Best Vendor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => (
                <tr key={row.internal_item_id} className="hover:bg-gray-50">
                  <td className="td font-mono text-xs text-gray-500">{row.internal_item_number}</td>
                  <td className="td font-medium text-gray-900">{row.internal_item_name}</td>
                  {vendors.map(v => {
                    const price = row.prices[v.vendor_id]
                    const isLowest = v.vendor_id === row.lowest_vendor_id
                    return (
                      <td
                        key={v.vendor_id}
                        className={`td text-right tabular-nums font-semibold ${
                          isLowest
                            ? 'text-green-700 bg-green-50'
                            : price !== null && price !== undefined
                            ? 'text-gray-800'
                            : 'text-gray-300'
                        }`}
                      >
                        {price !== null && price !== undefined
                          ? `$${price.toFixed(2)}`
                          : '—'}
                        {isLowest && price !== null && (
                          <span className="ml-1 text-green-500">✓</span>
                        )}
                      </td>
                    )
                  })}
                  <td className="td text-right tabular-nums font-bold text-green-700 bg-green-50">
                    ${row.lowest_price.toFixed(2)}
                  </td>
                  <td className="td text-sm text-green-700 font-medium">
                    {row.lowest_vendor_name}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td colSpan={2} className="td text-xs font-semibold text-gray-500">
                  Potential spend ({rows.length} matched items)
                </td>
                {vendors.map(v => (
                  <td key={v.vendor_id} className="td text-right tabular-nums font-bold text-primary">
                    ${vendorTotals[v.vendor_id].toFixed(2)}
                  </td>
                ))}
                <td className="td text-right tabular-nums font-bold text-green-700">
                  ${lowestTotal.toFixed(2)}
                </td>
                <td className="td" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
