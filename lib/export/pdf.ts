import type { GroupedRow, ComparisonRow, VendorSummary } from '@/types/database'
import { formatWeekRange } from '@/lib/utils/week'

const BRAND_COLOR: [number, number, number] = [62, 75, 84]   // #3e4b54 primary
const GREEN: [number, number, number] = [21, 128, 61]        // green-700

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getLastY(doc: any): number {
  return doc.lastAutoTable?.finalY ?? 44
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addHeader(doc: any, weekLabel: string, title: string): number {
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BRAND_COLOR)
  doc.text('Old City Hall Brewery', 14, 18)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  doc.text(title, 14, 26)
  doc.text(`Week of ${weekLabel}`, 14, 32)

  doc.setFontSize(8)
  doc.setTextColor(150)
  doc.text(
    `Generated: ${new Date().toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })}`,
    14, 38
  )
  doc.setTextColor(0)
  return 44
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addFooter(doc: any) {
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(
      `OCH Brewery — Confidential  |  Page ${i} of ${pageCount}`,
      14,
      doc.internal.pageSize.height - 10
    )
  }
}

// -------------------------------------------------------
// View 1 — Grouped by Vendor
// -------------------------------------------------------
export async function exportGroupedPDF(rows: GroupedRow[], vendors: VendorSummary[], weekStart: string) {
  const jsPDF = (await import('jspdf')).default
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
  const weekLabel = formatWeekRange(weekStart)
  let currentY = addHeader(doc, weekLabel, 'Order Guide Report — By Vendor')

  for (let vi = 0; vi < vendors.length; vi++) {
    const vendor = vendors[vi]
    const vendorRows = rows.filter(r => r.vendor_id === vendor.vendor_id)
    const total = vendorRows.reduce((sum, r) => sum + r.price, 0)

    if (vi > 0) currentY += 6

    // Vendor section header
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BRAND_COLOR)
    doc.text(vendor.vendor_name, 14, currentY)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    const subtext = vendor.file_name
      ? `${vendor.file_name} · ${vendor.row_count} items`
      : 'No order guide uploaded this week'
    doc.text(subtext, 14, currentY + 5)
    doc.setTextColor(0)
    currentY += 9

    if (vendorRows.length === 0) {
      doc.setFontSize(9)
      doc.setTextColor(150)
      doc.text('No items uploaded this week.', 14, currentY + 3)
      currentY += 8
      continue
    }

    autoTable(doc, {
      startY: currentY,
      head: [['Vendor Item #', 'Internal Item #', 'Item Name / Description', 'Price']],
      body: [
        ...vendorRows.map(r => [
          r.vendor_item_number ?? '—',
          r.internal_item_number ?? '—',
          r.item_name ?? '—',
          `$${r.price.toFixed(2)}`,
        ]),
        [
          '', '',
          { content: 'Subtotal', styles: { fontStyle: 'bold' as const } },
          { content: `$${total.toFixed(2)}`, styles: { fontStyle: 'bold' as const, halign: 'right' as const, textColor: BRAND_COLOR } },
        ],
      ],
      headStyles: { fillColor: BRAND_COLOR, textColor: 255 as unknown as [number,number,number], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 32 },
        3: { halign: 'right', cellWidth: 24 },
      },
      margin: { left: 14, right: 14 },
    })

    currentY = getLastY(doc) + 4
  }

  addFooter(doc)
  doc.save(`OCH-ByVendor-${weekStart}.pdf`)
}

// -------------------------------------------------------
// View 2 — Price Comparison
// -------------------------------------------------------
export async function exportComparisonPDF(rows: ComparisonRow[], vendors: VendorSummary[], weekStart: string) {
  const jsPDF = (await import('jspdf')).default
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
  const weekLabel = formatWeekRange(weekStart)
  const startY = addHeader(doc, weekLabel, 'Price Comparison Report')

  // Per-vendor totals
  const vendorTotals: Record<string, number> = {}
  vendors.forEach(v => { vendorTotals[v.vendor_id] = 0 })
  rows.forEach(row => {
    vendors.forEach(v => {
      const p = row.prices[v.vendor_id]
      if (p !== null && p !== undefined) vendorTotals[v.vendor_id] += p
    })
  })
  const lowestTotal = rows.reduce((sum, r) => sum + r.lowest_price, 0)

  const head = [
    ['Internal #', 'Item Name', ...vendors.map(v => v.vendor_name), 'Lowest', 'Best Vendor'],
  ]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any[] = [
    ...rows.map(row => [
      row.internal_item_number,
      row.internal_item_name,
      ...vendors.map(v => {
        const price = row.prices[v.vendor_id]
        return price !== null && price !== undefined ? `$${price.toFixed(2)}` : '—'
      }),
      { content: `$${row.lowest_price.toFixed(2)}`, styles: { textColor: GREEN, fontStyle: 'bold' } },
      { content: row.lowest_vendor_name, styles: { textColor: GREEN } },
    ]),
    [
      '',
      { content: 'Potential Spend', styles: { fontStyle: 'bold' } },
      ...vendors.map(v => ({
        content: `$${vendorTotals[v.vendor_id].toFixed(2)}`,
        styles: { fontStyle: 'bold', textColor: BRAND_COLOR },
      })),
      { content: `$${lowestTotal.toFixed(2)}`, styles: { fontStyle: 'bold', textColor: GREEN } },
      { content: 'Lowest Possible', styles: { textColor: GREEN } },
    ],
  ]

  autoTable(doc, {
    startY,
    head,
    body,
    headStyles: { fillColor: BRAND_COLOR, textColor: 255 as unknown as [number,number,number], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index >= 2 && data.column.index < 2 + vendors.length) {
        const rowIdx = data.row.index
        if (rowIdx < rows.length) {
          const compRow = rows[rowIdx]
          const vendorIdx = data.column.index - 2
          const vendor = vendors[vendorIdx]
          if (vendor && vendor.vendor_id === compRow.lowest_vendor_id) {
            data.cell.styles.fillColor = [220, 252, 231]
            data.cell.styles.textColor = GREEN
            data.cell.styles.fontStyle = 'bold'
          }
        }
      }
    },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 42 },
    },
    margin: { left: 14, right: 14 },
  })

  addFooter(doc)
  doc.save(`OCH-Comparison-${weekStart}.pdf`)
}
