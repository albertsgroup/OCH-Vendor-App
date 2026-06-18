import type { GroupedRow, ComparisonRow, VendorSummary, CartItem } from '@/types/database'
import { formatWeekRange } from '@/lib/utils/week'

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function escapeCSV(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function row(...cells: (string | number | null | undefined)[]): string {
  return cells.map(escapeCSV).join(',')
}

// -------------------------------------------------------
// View 1 — Grouped by Vendor
// -------------------------------------------------------
export function exportGroupedCSV(rows: GroupedRow[], vendors: VendorSummary[], weekStart: string) {
  const weekLabel = formatWeekRange(weekStart)
  const lines: string[] = []

  lines.push(row('Old City Hall Brewery — Order Guide Report (By Vendor)'))
  lines.push(row(`Week of ${weekLabel}`))
  lines.push(row(`Generated: ${new Date().toLocaleString()}`))
  lines.push('')

  for (const vendor of vendors) {
    const vendorRows = rows.filter(r => r.vendor_id === vendor.vendor_id)
    const total = vendorRows.reduce((sum, r) => sum + r.price, 0)

    lines.push(row(`VENDOR: ${vendor.vendor_name}`))
    if (vendor.file_name) {
      lines.push(row(`File: ${vendor.file_name}`, `Uploaded: ${vendor.uploaded_at ? new Date(vendor.uploaded_at).toLocaleDateString() : '—'}`))
    } else {
      lines.push(row('No order guide uploaded this week'))
    }

    lines.push(row('Vendor Item #', 'Internal Item #', 'Item Name / Description', 'Price'))

    for (const r of vendorRows) {
      lines.push(row(
        r.vendor_item_number,
        r.internal_item_number,
        r.item_name,
        r.price.toFixed(2),
      ))
    }

    lines.push(row('', '', 'SUBTOTAL', total.toFixed(2)))
    lines.push('')
  }

  downloadCSV(lines.join('\r\n'), `OCH-ByVendor-${weekStart}.csv`)
}

// -------------------------------------------------------
// View 2 — Price Comparison
// -------------------------------------------------------
export function exportComparisonCSV(rows: ComparisonRow[], vendors: VendorSummary[], weekStart: string) {
  const weekLabel = formatWeekRange(weekStart)
  const lines: string[] = []

  lines.push(row('Old City Hall Brewery — Price Comparison Report'))
  lines.push(row(`Week of ${weekLabel}`))
  lines.push(row(`Generated: ${new Date().toLocaleString()}`))
  lines.push('')

  // Header row
  lines.push(row(
    'Internal Item #',
    'Item Name',
    ...vendors.map(v => v.vendor_name),
    'Lowest Price',
    'Best Vendor',
  ))

  // Data rows
  for (const r of rows) {
    lines.push(row(
      r.internal_item_number,
      r.internal_item_name,
      ...vendors.map(v => {
        const price = r.prices[v.vendor_id]
        return price !== null && price !== undefined ? price.toFixed(2) : '—'
      }),
      r.lowest_price.toFixed(2),
      r.lowest_vendor_name,
    ))
  }

  // Totals row
  const vendorTotals = vendors.map(v =>
    rows.reduce((sum, r) => {
      const p = r.prices[v.vendor_id]
      return sum + (p !== null && p !== undefined ? p : 0)
    }, 0)
  )
  const lowestTotal = rows.reduce((sum, r) => sum + r.lowest_price, 0)

  lines.push(row(
    '',
    'POTENTIAL SPEND',
    ...vendorTotals.map(t => t.toFixed(2)),
    lowestTotal.toFixed(2),
    'Lowest Possible',
  ))

  downloadCSV(lines.join('\r\n'), `OCH-Comparison-${weekStart}.csv`)
}

// -------------------------------------------------------
// Cart
// -------------------------------------------------------
export function exportCartCSV(items: CartItem[], weekStart: string) {
  const weekLabel = formatWeekRange(weekStart)
  const lines: string[] = []

  lines.push(row('Old City Hall BBQ — Purchase Cart'))
  lines.push(row(`Week of ${weekLabel}`))
  lines.push(row(`Generated: ${new Date().toLocaleString()}`))
  lines.push('')

  // Group by vendor
  const vendors = [...new Set(items.map(i => i.vendorId))]
  const vendorNames: Record<string, string> = {}
  items.forEach(i => { vendorNames[i.vendorId] = i.vendorName })

  let grandTotal = 0

  for (const vendorId of vendors) {
    const vendorItems = items.filter(i => i.vendorId === vendorId)
    const vendorTotal = vendorItems.reduce((sum, i) => sum + i.price * i.quantity, 0)
    grandTotal += vendorTotal

    lines.push(row(`VENDOR: ${vendorNames[vendorId]}`))
    lines.push(row('Vendor Item #', 'Item Name', 'Unit Size', 'Case Price', 'Qty', 'Line Total'))

    for (const item of vendorItems) {
      lines.push(row(
        item.vendorItemNumber,
        item.itemName,
        item.unitSize,
        item.price.toFixed(2),
        item.quantity,
        (item.price * item.quantity).toFixed(2),
      ))
    }

    lines.push(row('', '', '', '', 'SUBTOTAL', vendorTotal.toFixed(2)))
    lines.push('')
  }

  lines.push(row('', '', '', '', 'GRAND TOTAL', grandTotal.toFixed(2)))

  downloadCSV(lines.join('\r\n'), `OCH-Cart-${weekStart}.csv`)
}
