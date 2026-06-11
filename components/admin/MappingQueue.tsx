'use client'

import { useState } from 'react'
import type { Item } from '@/types/database'

export interface QueueRow {
  id: string
  vendor_name: string
  vendor_id: string
  vendor_item_number: string | null
  item_name: string | null
  price: number
  ai_confidence: number | null
  ai_suggested_item_id: string | null
  ai_match_reason: string | null
  week_start: string
}

interface Props {
  rows: QueueRow[]
  internalItems: Item[]
  onResolved: (rowId: string, result: { internal_item_id: string; item_number?: string; item_name?: string } | null) => void
}

interface RowState {
  action: 'match' | 'new' | null
  selectedItemId: string
  newItemName: string
  saving: boolean
  done: boolean
  error: string | null
}

export default function MappingQueue({ rows: initialRows, internalItems, onResolved }: Props) {
  const [rows, setRows] = useState<QueueRow[]>(initialRows)
  const [rowState, setRowState] = useState<Record<string, RowState>>({})

  function getState(rowId: string): RowState {
    return rowState[rowId] ?? {
      action: null,
      selectedItemId: '',
      newItemName: '',
      saving: false,
      done: false,
      error: null,
    }
  }

  function updateState(rowId: string, patch: Partial<RowState>) {
    setRowState(prev => ({
      ...prev,
      [rowId]: { ...getState(rowId), ...patch },
    }))
  }

  async function handleConfirm(row: QueueRow) {
    const state = getState(row.id)
    if (!state.action) return
    if (state.action === 'match' && !state.selectedItemId) return
    if (state.action === 'new' && !state.newItemName.trim()) return

    updateState(row.id, { saving: true, error: null })

    const body: Record<string, string> = { row_id: row.id, action: state.action }
    if (state.action === 'match') body.internal_item_id = state.selectedItemId
    if (state.action === 'new') body.new_item_name = state.newItemName.trim()

    try {
      const res = await fetch('/api/admin/confirm-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!res.ok) {
        updateState(row.id, { saving: false, error: data.error ?? 'Failed to save. Try again.' })
        return
      }

      updateState(row.id, { saving: false, done: true })
      setRows(prev => prev.filter(r => r.id !== row.id))
      onResolved(row.id, data.internal_item_id ? {
        internal_item_id: data.internal_item_id,
        item_number: data.item_number,
        item_name: data.item_name,
      } : null)
    } catch {
      updateState(row.id, { saving: false, error: 'Network error. Please try again.' })
    }
  }

  async function handleDismiss(row: QueueRow) {
    updateState(row.id, { saving: true, error: null })
    try {
      await fetch('/api/admin/confirm-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row_id: row.id, action: 'dismiss' }),
      })
      updateState(row.id, { saving: false, done: true })
      setRows(prev => prev.filter(r => r.id !== row.id))
      onResolved(row.id, null)
    } catch {
      updateState(row.id, { saving: false, error: 'Network error.' })
    }
  }

  if (rows.length === 0) {
    return (
      <div className="card p-8 text-center">
        <svg className="w-10 h-10 text-green-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="font-semibold text-gray-700">All caught up!</p>
        <p className="text-sm text-gray-400 mt-1">No items need your review right now.</p>
      </div>
    )
  }

  // Group by vendor
  const byVendor: Record<string, QueueRow[]> = {}
  rows.forEach(row => {
    const key = `${row.vendor_id}::${row.vendor_name}`
    if (!byVendor[key]) byVendor[key] = []
    byVendor[key].push(row)
  })

  return (
    <div className="space-y-8">
      {Object.entries(byVendor).map(([vendorKey, vendorRows]) => {
        const vendorName = vendorKey.split('::')[1]

        return (
          <div key={vendorKey}>
            <h3 className="text-sm font-bold text-primary uppercase tracking-wide mb-3">
              {vendorName} — {vendorRows.length} item{vendorRows.length !== 1 ? 's' : ''} to review
            </h3>

            <div className="space-y-3">
              {vendorRows.map(row => {
                const state = getState(row.id)
                const suggestedItem = row.ai_suggested_item_id
                  ? internalItems.find(i => i.id === row.ai_suggested_item_id)
                  : null
                const confidencePct = row.ai_confidence != null
                  ? Math.round(row.ai_confidence * 100)
                  : null
                const isNewSuggestion = row.ai_match_reason?.startsWith('New item')

                // Extract suggested name from "New item — suggested common name: '...'"
                const suggestedNewName = isNewSuggestion
                  ? row.ai_match_reason?.match(/suggested common name: "([^"]+)"/)?.[1] ?? row.item_name ?? ''
                  : ''

                return (
                  <div key={row.id} className={`card p-4 border-l-4 ${
                    isNewSuggestion ? 'border-l-blue-400' : 'border-l-amber-400'
                  }`}>
                    {/* Row header */}
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900">{row.item_name ?? 'Unknown item'}</span>
                          {row.vendor_item_number && (
                            <span className="font-mono text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                              {row.vendor_item_number}
                            </span>
                          )}
                          <span className="font-semibold text-primary">${row.price.toFixed(2)}</span>
                        </div>

                        {/* AI reasoning */}
                        <p className="text-xs text-gray-500 mt-1">
                          {isNewSuggestion ? (
                            <span className="text-blue-600">
                              🔵 AI: No matching item found in catalogue — suggests creating a new one
                            </span>
                          ) : (
                            <span className="text-amber-600">
                              🟡 AI: {row.ai_match_reason}
                              {confidencePct != null && ` (${confidencePct}% confidence)`}
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Dismiss button */}
                      <button
                        onClick={() => handleDismiss(row)}
                        disabled={state.saving}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                        title="Skip this item"
                      >
                        Skip
                      </button>
                    </div>

                    {/* Action selector */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      <button
                        onClick={() => updateState(row.id, {
                          action: 'match',
                          selectedItemId: suggestedItem?.id ?? '',
                          newItemName: '',
                        })}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
                          state.action === 'match'
                            ? 'bg-primary text-white border-primary'
                            : 'border-gray-300 text-gray-600 hover:border-primary hover:text-primary'
                        }`}
                      >
                        Match to existing item
                      </button>
                      <button
                        onClick={() => updateState(row.id, {
                          action: 'new',
                          newItemName: suggestedNewName || row.item_name || '',
                          selectedItemId: '',
                        })}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
                          state.action === 'new'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'border-gray-300 text-gray-600 hover:border-blue-500 hover:text-blue-600'
                        }`}
                      >
                        + Create new internal item
                      </button>
                    </div>

                    {/* Match: select existing item */}
                    {state.action === 'match' && (
                      <div className="space-y-2">
                        {suggestedItem && (
                          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
                            <strong>AI suggestion:</strong> {suggestedItem.item_number} — {suggestedItem.item_name}
                            {' '}
                            <button
                              onClick={() => updateState(row.id, { selectedItemId: suggestedItem.id })}
                              className="underline ml-1 text-amber-800"
                            >
                              Use this
                            </button>
                          </div>
                        )}
                        <select
                          value={state.selectedItemId}
                          onChange={e => updateState(row.id, { selectedItemId: e.target.value })}
                          className="input text-sm"
                        >
                          <option value="">— Select internal item —</option>
                          {internalItems.map(item => (
                            <option key={item.id} value={item.id}>
                              {item.item_number} — {item.item_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* New item: enter common name */}
                    {state.action === 'new' && (
                      <div className="space-y-1.5">
                        <label className="label text-xs">
                          Internal item name <span className="text-gray-400">(common name, e.g. "Chicken Breasts")</span>
                        </label>
                        <input
                          type="text"
                          value={state.newItemName}
                          onChange={e => updateState(row.id, { newItemName: e.target.value })}
                          placeholder="e.g. Chicken Breasts"
                          className="input text-sm"
                        />
                        <p className="text-xs text-gray-400">
                          A unique OCH number (e.g. OCH2847) will be auto-generated.
                        </p>
                      </div>
                    )}

                    {/* Error */}
                    {state.error && (
                      <p className="text-xs text-red-600 mt-2">{state.error}</p>
                    )}

                    {/* Confirm button */}
                    {state.action && (
                      <div className="mt-3">
                        <button
                          onClick={() => handleConfirm(row)}
                          disabled={
                            state.saving ||
                            (state.action === 'match' && !state.selectedItemId) ||
                            (state.action === 'new' && !state.newItemName.trim())
                          }
                          className="btn-primary text-xs px-4 py-2"
                        >
                          {state.saving ? 'Saving…' : 'Confirm'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
