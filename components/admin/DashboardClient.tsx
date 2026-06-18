'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ViewGrouped from './ViewGrouped'
import ViewComparison from './ViewComparison'
import type { GroupedRow, ComparisonRow, VendorSummary, Item } from '@/types/database'
import { formatWeekRange } from '@/lib/utils/week'

interface Props {
  groupedRows: GroupedRow[]
  comparisonRows: ComparisonRow[]
  vendors: VendorSummary[]
  internalItems: Item[]
  availableWeeks: string[]
  selectedWeek: string
  currentWeek: string
  weekLabel: string
}

type ViewMode = 'grouped' | 'comparison'

export default function DashboardClient({
  groupedRows: initialGrouped,
  comparisonRows,
  vendors,
  internalItems,
  availableWeeks,
  selectedWeek,
  currentWeek,
  weekLabel,
}: Props) {
  const router = useRouter()
  const [view, setView] = useState<ViewMode>('grouped')
  const [groupedRows, setGroupedRows] = useState<GroupedRow[]>(initialGrouped)
  const [exporting, setExporting] = useState<'csv-grouped' | 'csv-comparison' | 'pdf-grouped' | 'pdf-comparison' | null>(null)
  const [, startTransition] = useTransition()

  function handleWeekChange(week: string) {
    startTransition(() => {
      router.push(`/admin/dashboard?week=${week}`)
    })
  }

  async function handleMapItem(vendorId: string, vendorItemNumber: string, internalItemId: string | null) {
    const res = await fetch('/api/admin/map-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendor_id: vendorId, vendor_item_number: vendorItemNumber, internal_item_id: internalItemId }),
    })
    if (!res.ok) return

    // Update local state optimistically
    const internal = internalItemId ? internalItems.find(i => i.id === internalItemId) : null
    setGroupedRows(prev =>
      prev.map(row =>
        row.vendor_id === vendorId && row.vendor_item_number === vendorItemNumber
          ? {
              ...row,
              internal_item_id: internalItemId,
              internal_item_number: internal?.item_number ?? null,
              internal_item_name: internal?.item_name ?? null,
            }
          : row
      )
    )
    // Reload full page to get updated comparison view
    router.refresh()
  }

  async function handleExportCSV(which: 'grouped' | 'comparison') {
    setExporting(`csv-${which}`)
    const { exportGroupedCSV, exportComparisonCSV } = await import('@/lib/export/csv')
    if (which === 'grouped') {
      exportGroupedCSV(groupedRows, vendors, selectedWeek)
    } else {
      exportComparisonCSV(comparisonRows, vendors, selectedWeek)
    }
    setExporting(null)
  }

  async function handleExportPDF(which: 'grouped' | 'comparison') {
    setExporting(`pdf-${which}`)
    const { exportGroupedPDF, exportComparisonPDF } = await import('@/lib/export/pdf')
    if (which === 'grouped') {
      await exportGroupedPDF(groupedRows, vendors, selectedWeek)
    } else {
      await exportComparisonPDF(comparisonRows, vendors, selectedWeek)
    }
    setExporting(null)
  }

  const vendorsWithUploads = vendors.filter(v => v.upload_id)
  const vendorsWithout = vendors.filter(v => !v.upload_id)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary font-heading">Weekly Report</h1>
          <p className="text-light-grey-500 mt-1 font-sans text-sm">Week of {weekLabel}</p>
        </div>

        {/* Week selector */}
        <select
          value={selectedWeek}
          onChange={e => handleWeekChange(e.target.value)}
          className="input w-auto text-sm"
        >
          {availableWeeks.map(week => (
            <option key={week} value={week}>
              {week === currentWeek ? `Current Week (${formatWeekRange(week)})` : formatWeekRange(week)}
            </option>
          ))}
        </select>
      </div>

      {/* Upload status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-light-grey-500 mb-1">Uploaded</p>
          <p className="text-3xl font-bold font-heading text-green-700">{vendorsWithUploads.length}</p>
          {vendorsWithUploads.length > 0 && (
            <p className="text-xs text-light-grey-400 mt-1">{vendorsWithUploads.map(v => v.vendor_name).join(', ')}</p>
          )}
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-light-grey-500 mb-1">Awaiting</p>
          <p className="text-3xl font-bold font-heading text-amber-600">{vendorsWithout.length}</p>
          {vendorsWithout.length > 0 && (
            <p className="text-xs text-light-grey-400 mt-1">{vendorsWithout.map(v => v.vendor_name).join(', ')}</p>
          )}
        </div>
      </div>

      {/* View toggle + export bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Toggle */}
        <div className="inline-flex rounded-lg border border-light-grey-300 bg-white overflow-hidden shadow-sm">
          <button
            onClick={() => setView('grouped')}
            className={`px-4 py-2 text-sm font-semibold transition-colors ${
              view === 'grouped'
                ? 'bg-primary text-white'
                : 'text-primary-300 hover:bg-secondary-100'
            }`}
          >
            View 1 — By Vendor
          </button>
          <button
            onClick={() => setView('comparison')}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-l border-light-grey-300 ${
              view === 'comparison'
                ? 'bg-primary text-white'
                : 'text-primary-300 hover:bg-secondary-100'
            }`}
          >
            View 2 — Price Comparison
          </button>
        </div>

        {/* Export buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleExportCSV(view === 'grouped' ? 'grouped' : 'comparison')}
            disabled={!!exporting}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
          >
            {exporting?.startsWith('csv') ? (
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
            onClick={() => handleExportPDF(view === 'grouped' ? 'grouped' : 'comparison')}
            disabled={!!exporting}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
          >
            {exporting?.startsWith('pdf') ? (
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
            onClick={() => window.print()}
            className="btn-secondary text-xs px-3 py-1.5 no-print flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
            </svg>
            Print
          </button>
        </div>
      </div>

      {/* Active view */}
      {view === 'grouped' ? (
        <ViewGrouped
          rows={groupedRows}
          vendors={vendors}
          internalItems={internalItems}
          onMapItem={handleMapItem}
        />
      ) : (
        <ViewComparison
          rows={comparisonRows}
          vendors={vendors}
          selectedWeek={selectedWeek}
        />
      )}
    </div>
  )
}
