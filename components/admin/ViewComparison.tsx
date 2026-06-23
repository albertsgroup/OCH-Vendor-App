'use client'

import { useState, useMemo } from 'react'
import type { ComparisonRow, VendorSummary, MatchGroup, CartItem } from '@/types/database'
import { normalizePrice, breakdownPrice, extractUnitSizeFromName } from '@/lib/utils/parseUnitSize'

const C = {
  bg:          '#fdfcfa',
  surface:     '#ffffff',
  border:      '#e2ddd7',
  borderMid:   '#d1cbc1',
  primary:     '#3e4b54',
  primaryDim:  '#7f8e98',
  beigeLight:  '#f8f5ef',
  beige:       '#f0ece2',
  dark:        '#263139',
  text:        '#263139',
  textMid:     '#3e4b54',
  textMuted:   '#a8b2b9',
  lowestBg:    '#d1fae5',
  lowestText:  '#065f46',
  lowestBorder:'#6ee7b7',
  matchedLeft: '#3e4b54',
}

const TH: React.CSSProperties = {
  padding: '11px 14px 9px',
  fontFamily: 'var(--font-sans)',
  fontSize: '0.68rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontWeight: 600,
  color: '#ffffff',
  background: C.primary,
  whiteSpace: 'nowrap',
}

const SUB_TH: React.CSSProperties = {
  padding: '6px 14px 8px',
  fontFamily: 'var(--font-sans)',
  fontSize: '0.6rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontWeight: 500,
  color: C.primaryDim,
  background: C.beigeLight,
  borderBottom: `1px solid ${C.border}`,
  whiteSpace: 'nowrap',
}

const TD: React.CSSProperties = {
  padding: '10px 14px',
  verticalAlign: 'middle',
  fontFamily: 'var(--font-sans)',
  fontSize: '0.82rem',
}

interface Props {
  rows: ComparisonRow[]
  vendors: VendorSummary[]
  selectedWeek: string
  matchGroups: MatchGroup[] | null
  onMatchComplete: (groups: MatchGroup[]) => void
  onClearMatch: () => void
  onAddToCart: (item: CartItem) => void
}

type Mode = 'all' | 'savings' | 'missing'

export default function ViewComparison({ rows, vendors, selectedWeek, matchGroups, onMatchComplete, onClearMatch, onAddToCart }: Props) {
  const [matching, setMatching] = useState(false)
  const [matchError, setMatchError] = useState<string | null>(null)

  // Legacy manual-map search/filter state
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<Mode>('all')

  // AI match search + filter
  const [aiSearch, setAiSearch] = useState('')
  const [aiFilter, setAiFilter] = useState<'all' | 'matched' | 'savings'>('all')

  async function runAIMatch() {
    setMatching(true)
    setMatchError(null)
    try {
      const res = await fetch(`/api/admin/ai-match?week=${selectedWeek}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      onMatchComplete(data.groups ?? [])
    } catch (e) {
      setMatchError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setMatching(false)
    }
  }

  // ── AI match view ────────────────────────────────────────────
  if (matching) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <svg style={{ width: 36, height: 36, animation: 'spin 1s linear infinite', color: C.primary }} fill="none" viewBox="0 0 24 24">
            <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <div>
            <p style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', color: C.primary, margin: 0 }}>
              Matching items with AI…
            </p>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: C.textMuted, marginTop: 6 }}>
              Claude is reading all uploaded items and grouping similar products across vendors.
            </p>
          </div>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (matchGroups !== null) {
    return <AIMatchView
      groups={matchGroups}
      vendors={vendors}
      search={aiSearch}
      filter={aiFilter}
      onSearchChange={setAiSearch}
      onFilterChange={setAiFilter}
      onRerun={runAIMatch}
      onClear={onClearMatch}
      onAddToCart={onAddToCart}
    />
  }

  // ── Default: show AI button + legacy table ───────────────────
  return (
    <div style={{ padding: '0.25rem 0 2rem' }}>

      {/* AI Match CTA */}
      <div style={{
        background: C.beigeLight,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: '1.5rem 1.75rem',
        marginBottom: '1.75rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
      }}>
        <div>
          <p style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', color: C.primary, margin: 0, fontWeight: 700 }}>
            Match Items with AI
          </p>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.78rem', color: C.textMuted, marginTop: 4 }}>
            Claude will read all vendor uploads and group similar items side-by-side — no manual mapping needed.
          </p>
          {matchError && (
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: '#dc2626', marginTop: 6 }}>
              Error: {matchError}
            </p>
          )}
        </div>
        <button
          onClick={runAIMatch}
          style={{
            background: C.primary,
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '10px 22px',
            fontFamily: 'var(--font-sans)',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          Run AI Match
        </button>
      </div>

      {/* Legacy manual-mapping table */}
      <LegacyComparisonView
        rows={rows}
        vendors={vendors}
        search={search}
        mode={mode}
        onSearchChange={setSearch}
        onModeChange={setMode}
      />
    </div>
  )
}

// ── AI Match Results Table ────────────────────────────────────

function AIMatchView({
  groups,
  vendors,
  search,
  filter,
  onSearchChange,
  onFilterChange,
  onRerun,
  onClear,
  onAddToCart,
}: {
  groups: MatchGroup[]
  vendors: VendorSummary[]
  search: string
  filter: 'all' | 'matched' | 'savings'
  onSearchChange: (v: string) => void
  onFilterChange: (f: 'all' | 'matched' | 'savings') => void
  onRerun: () => void
  onClear: () => void
  onAddToCart: (item: CartItem) => void
}) {
  const filtered = useMemo(() => {
    let result = groups
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(g =>
        g.commonName.toLowerCase().includes(q) ||
        g.vendorItems.some(v => v.itemName.toLowerCase().includes(q))
      )
    }
    if (filter === 'matched') {
      result = result.filter(g => g.isMatched)
    } else if (filter === 'savings') {
      result = result.filter(g => g.isMatched)
      // Will sort by case savings descending after rendering — flag is enough for filter
    }
    return result
  }, [groups, search, filter])

  const matched = groups.filter(g => g.isMatched).length
  const total   = groups.length

  const inputStyle: React.CSSProperties = {
    background: C.surface,
    color: C.text,
    border: `1px solid ${C.borderMid}`,
    borderRadius: 8,
    padding: '7px 12px',
    fontFamily: 'var(--font-sans)',
    fontSize: '0.82rem',
    outline: 'none',
    flex: 1,
    minWidth: 200,
  }

  return (
    <div style={{ padding: '0.25rem 0 2rem' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Search items…"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          style={inputStyle}
        />
        <button onClick={onRerun} style={{ background: 'transparent', border: `1px solid ${C.borderMid}`, color: C.textMid, borderRadius: 8, padding: '7px 14px', fontFamily: 'var(--font-sans)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          ↺ Re-run Match
        </button>
        <button onClick={onClear} style={{ background: 'transparent', border: `1px solid ${C.borderMid}`, color: C.textMuted, borderRadius: 8, padding: '7px 14px', fontFamily: 'var(--font-sans)', fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          ✕ Clear
        </button>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {(['all', 'matched', 'savings'] as const).map(f => {
          const labels = { all: 'All items', matched: 'Matched only', savings: 'Best savings' }
          const active = filter === f
          return (
            <button
              key={f}
              onClick={() => onFilterChange(f)}
              style={{
                background: active ? C.primary : C.surface,
                color: active ? '#fff' : C.textMid,
                border: `1px solid ${active ? C.primary : C.borderMid}`,
                borderRadius: 20,
                padding: '5px 14px',
                fontFamily: 'var(--font-sans)',
                fontSize: '0.72rem',
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {labels[f]}
            </button>
          )
        })}
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total items',     value: String(total) },
          { label: 'Cross-vendor matches', value: String(matched) },
          { label: 'Single-vendor',   value: String(total - matched) },
          { label: 'Vendors',         value: String(vendors.length) },
        ].map(s => (
          <div key={s.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '1rem 1.1rem' }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, color: C.primaryDim, marginBottom: 6 }}>
              {s.label}
            </div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.65rem', color: C.primary, lineHeight: 1, fontWeight: 700 }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', marginBottom: '0.85rem', fontFamily: 'var(--font-sans)', fontSize: '0.7rem', color: C.textMuted, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: C.lowestBg, border: `1px solid ${C.lowestBorder}`, display: 'inline-block' }} />
          Lowest price
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 3, height: 16, borderRadius: 2, background: C.matchedLeft, display: 'inline-block' }} />
          Matched across vendors
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.58rem', fontWeight: 600, background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7', borderRadius: 4, padding: '1px 5px' }}>HIGH</span>
          <span style={{ fontSize: '0.58rem', fontWeight: 600, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 4, padding: '1px 5px' }}>MEDIUM</span>
          <span style={{ fontSize: '0.58rem', fontWeight: 600, background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 4, padding: '1px 5px' }}>LOW</span>
          Match confidence
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 1px 3px rgba(38,49,57,0.06)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 + vendors.length * 160 }}>
          <thead>
            <tr>
              <th style={{ ...TH, textAlign: 'left', borderRight: `1px solid rgba(255,255,255,0.12)`, minWidth: 220 }}>Item</th>
              {vendors.map((v, i) => (
                <th key={v.vendor_id} style={{ ...TH, textAlign: 'center', width: 160, borderRight: i < vendors.length - 1 ? `1px solid rgba(255,255,255,0.12)` : undefined }}>
                  {v.vendor_name}
                </th>
              ))}
              <th style={{ ...TH, width: 100, textAlign: 'center' }}>Best Save</th>
            </tr>
            <tr>
              <th style={{ ...SUB_TH, textAlign: 'left', borderRight: `1px solid ${C.border}` }}>Common name · vendor item name</th>
              {vendors.map((v, i) => (
                <th key={v.vendor_id} style={{ ...SUB_TH, textAlign: 'center', borderRight: i < vendors.length - 1 ? `1px solid ${C.border}` : undefined }}>price · unit size</th>
              ))}
              <th style={{ ...SUB_TH, textAlign: 'center' }}>vs highest</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={2 + vendors.length} style={{ textAlign: 'center', padding: '3rem', color: C.textMuted, fontFamily: 'var(--font-sans)', fontSize: '0.82rem' }}>
                  No items match your search.
                </td>
              </tr>
            ) : filtered.map((group, rowIdx) => {
              // Build a map: vendorId → item + weight
              const byVendor: Record<string, MatchGroup['vendorItems'][0]> = {}
              group.vendorItems.forEach(vi => { byVendor[vi.vendorId] = vi })

              // Resolve effective unit size: stored value takes priority; fall back to
              // extracting pack info from the item name (e.g. "4/5# SWISS CHEESE" → "4/5LB")
              const effectiveUnitSizeById: Record<string, string | null> = {}
              group.vendorItems.forEach(vi => {
                effectiveUnitSizeById[vi.rowId] = vi.unitSize || extractUnitSizeFromName(vi.itemName)
              })

              // Always normalise to $/lb or $/ct for comparison
              const normById: Record<string, ReturnType<typeof normalizePrice>> = {}
              group.vendorItems.forEach(vi => {
                normById[vi.rowId] = normalizePrice(vi.price, effectiveUnitSizeById[vi.rowId])
              })

              // Only compare when all present vendors share the same unit label
              const presentNorms = group.vendorItems.map(vi => normById[vi.rowId]).filter(Boolean)
              const labels = [...new Set(presentNorms.map(n => n!.label))]
              const canCompare = labels.length === 1 && presentNorms.length > 1
              const normValues = canCompare ? presentNorms.map(n => n!.value) : []
              const minNorm = normValues.length ? Math.min(...normValues) : null
              const maxNorm = normValues.length ? Math.max(...normValues) : null
              const saving = minNorm !== null && maxNorm !== null ? maxNorm - minNorm : 0
              const mixedUnits = presentNorms.length > 1 && labels.length > 1

              return (
                <tr
                  key={rowIdx}
                  style={{
                    borderBottom: rowIdx < filtered.length - 1 ? `1px solid ${C.border}` : undefined,
                    background: rowIdx % 2 === 0 ? C.surface : C.bg,
                  }}
                >
                  {/* Item name column */}
                  <td style={{ ...TD, borderRight: `1px solid ${C.border}`, borderLeft: group.isMatched ? `3px solid ${C.matchedLeft}` : `3px solid transparent` }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', color: C.dark, fontWeight: 700 }}>
                        {group.commonName}
                      </span>
                      {group.isMatched && group.confidence && (
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.58rem',
                          fontFamily: 'var(--font-sans)',
                          fontWeight: 600,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          borderRadius: 4,
                          padding: '2px 6px',
                          marginTop: 2,
                          background: group.confidence === 'high' ? '#d1fae5' : group.confidence === 'medium' ? '#fef3c7' : '#f1f5f9',
                          color: group.confidence === 'high' ? '#065f46' : group.confidence === 'medium' ? '#92400e' : '#64748b',
                          border: `1px solid ${group.confidence === 'high' ? '#6ee7b7' : group.confidence === 'medium' ? '#fcd34d' : '#cbd5e1'}`,
                        }}>
                          {group.confidence}
                        </span>
                      )}
                    </div>
                    {group.isMatched && group.matchReason && (
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.67rem', color: C.primaryDim, marginTop: 3, fontStyle: 'italic' }}>
                        {group.matchReason}
                      </div>
                    )}
                    {group.isMatched && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem 0.75rem', marginTop: 4 }}>
                        {group.vendorItems.map(vi => (
                          <span key={vi.vendorId} style={{ fontFamily: 'var(--font-sans)', fontSize: '0.65rem', color: C.textMuted }}>
                            {vi.vendorName}: {vi.itemName}
                          </span>
                        ))}
                      </div>
                    )}
                    {!group.isMatched && group.vendorItems[0] && group.vendorItems[0].itemName !== group.commonName && (
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.68rem', color: C.textMuted, marginTop: 2 }}>
                        {group.vendorItems[0].vendorName}: {group.vendorItems[0].itemName}
                      </div>
                    )}
                  </td>

                  {/* Per-vendor price cells */}
                  {vendors.map((v, i) => {
                    const vi = byVendor[v.vendor_id]
                    if (!vi) {
                      return (
                        <td key={v.vendor_id} style={{ ...TD, textAlign: 'center', borderRight: i < vendors.length - 1 ? `1px solid ${C.border}` : undefined }}>
                          <span style={{ color: C.borderMid }}>—</span>
                        </td>
                      )
                    }
                    const norm = normById[vi.rowId]
                    const bd   = breakdownPrice(vi.price, effectiveUnitSizeById[vi.rowId])
                    const isLowest = canCompare && norm !== null && norm.value === minNorm

                    return (
                      <td key={v.vendor_id} style={{ ...TD, textAlign: 'center', fontVariantNumeric: 'tabular-nums', borderRight: i < vendors.length - 1 ? `1px solid ${C.border}` : undefined }}>
                        <div>
                          {/* Primary: $/lb or $/ct */}
                          {norm ? (
                            isLowest ? (
                              <span style={{ display: 'inline-block', background: C.lowestBg, color: C.lowestText, border: `1px solid ${C.lowestBorder}`, borderRadius: 5, padding: '2px 9px', fontWeight: 600, fontSize: '0.84rem' }}>
                                ${norm.value.toFixed(2)}{norm.label === '$/lb' ? '/lb' : '/ct'}
                              </span>
                            ) : (
                              <span style={{ color: C.textMid, fontWeight: 500, fontSize: '0.84rem' }}>
                                ${norm.value.toFixed(2)}{norm.label === '$/lb' ? '/lb' : '/ct'}
                              </span>
                            )
                          ) : (
                            <span style={{ color: C.textMid, fontWeight: 500, fontSize: '0.84rem' }}>
                              ${vi.price.toFixed(2)}
                            </span>
                          )}
                          {/* Secondary: $/pack (only when multi-pack structure) */}
                          {bd !== null && bd.packCount !== null && bd.perPack !== null && bd.perPack !== norm?.value && (
                            <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.62rem', color: C.textMuted, marginTop: 2, lineHeight: 1.4 }}>
                              ${bd.perPack.toFixed(2)}/pack
                              {bd.packSize && bd.packSizeUnit
                                ? ` · ${bd.packSize % 1 === 0 ? bd.packSize : bd.packSize.toFixed(1)} ${bd.packSizeUnit} each`
                                : ''}
                            </div>
                          )}
                          {/* Tertiary: case price + totals */}
                          <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.62rem', color: C.textMuted, marginTop: 2, lineHeight: 1.4 }}>
                            {bd !== null
                              ? bd.unitLabel === '$/lb'
                                ? `$${vi.price.toFixed(2)} case · ${bd.totalInCase % 1 === 0 ? bd.totalInCase : bd.totalInCase.toFixed(1)} lb`
                                : `$${vi.price.toFixed(2)} case · ${bd.totalInCase} units`
                              : `$${vi.price.toFixed(2)} case${vi.unitSize ? ` · ${vi.unitSize}` : ''}`
                            }
                          </div>
                          <button
                            onClick={() => onAddToCart({
                              rowId: vi.rowId,
                              vendorId: vi.vendorId,
                              vendorName: vi.vendorName,
                              itemName: group.commonName,
                              vendorItemNumber: vi.vendorItemNumber ?? null,
                              unitSize: vi.unitSize ?? null,
                              price: vi.price,
                              quantity: 1,
                            })}
                            style={{
                              marginTop: 6,
                              background: isLowest ? C.lowestText : C.primary,
                              color: '#fff',
                              border: 'none',
                              borderRadius: 5,
                              padding: '3px 10px',
                              fontSize: '0.68rem',
                              fontFamily: 'var(--font-sans)',
                              fontWeight: 600,
                              cursor: 'pointer',
                              letterSpacing: '0.04em',
                            }}
                          >
                            + Add
                          </button>
                        </div>
                      </td>
                    )
                  })}

                  {/* Best save */}
                  <td style={{ ...TD, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                    {(() => {
                      // Case-price savings (always available when 2+ vendors present)
                      const casePrices = group.vendorItems.map(vi => vi.price).filter(p => p > 0)
                      const minCase = casePrices.length > 1 ? Math.min(...casePrices) : null
                      const maxCase = casePrices.length > 1 ? Math.max(...casePrices) : null
                      const caseSaving = minCase !== null && maxCase !== null ? maxCase - minCase : 0

                      if (!group.isMatched || caseSaving <= 0) {
                        return <span style={{ color: C.borderMid }}>—</span>
                      }
                      return (
                        <div>
                          <span style={{ color: '#059669', fontWeight: 700, fontSize: '0.88rem' }}>
                            ${caseSaving.toFixed(2)}
                          </span>
                          <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.6rem', color: C.textMuted, marginTop: 1 }}>
                            /case
                          </div>
                          {maxCase && (
                            <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.6rem', color: '#059669', marginTop: 1 }}>
                              {((caseSaving / maxCase) * 100).toFixed(0)}% cheaper
                            </div>
                          )}
                          {saving > 0 && canCompare && (
                            <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.58rem', color: C.textMuted, marginTop: 2 }}>
                              ${saving.toFixed(2)}{labels[0] === '$/lb' ? '/lb' : '/ct'}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={{ marginTop: '0.75rem', fontFamily: 'var(--font-sans)', fontSize: '0.65rem', letterSpacing: '0.06em', color: C.textMuted, textAlign: 'right' }}>
        {filtered.length} item{filtered.length !== 1 ? 's' : ''} · {matched} matched across vendors
      </div>
    </div>
  )
}

// ── Legacy manual-mapping comparison ─────────────────────────

function LegacyComparisonView({
  rows, vendors, search, mode, onSearchChange, onModeChange,
}: {
  rows: ComparisonRow[]
  vendors: VendorSummary[]
  search: string
  mode: Mode
  onSearchChange: (v: string) => void
  onModeChange: (m: Mode) => void
}) {
  const filtered = useMemo(() => {
    let data = rows
    if (search) {
      const q = search.toLowerCase()
      data = data.filter(r =>
        r.internal_item_name?.toLowerCase().includes(q) ||
        r.internal_item_number?.toLowerCase().includes(q)
      )
    }
    if (mode === 'savings') {
      data = data.filter(r => {
        const vals = vendors.map(v => r.prices[v.vendor_id]).filter((v): v is number => v !== null)
        return vals.length >= 2 && Math.max(...vals) - Math.min(...vals) > 2
      })
    }
    if (mode === 'missing') {
      data = data.filter(r => vendors.some(v => r.prices[v.vendor_id] == null))
    }
    return data
  }, [rows, search, mode, vendors])

  const stats = useMemo(() => {
    let totalSave = 0; let saveCount = 0
    filtered.forEach(r => {
      const vals = vendors.map(v => r.prices[v.vendor_id]).filter((v): v is number => v !== null)
      if (vals.length >= 2) { totalSave += Math.max(...vals) - Math.min(...vals); saveCount++ }
    })
    return { totalSave, avgSave: saveCount ? totalSave / saveCount : 0 }
  }, [filtered, vendors])

  function exportCSV() {
    const headers = ['OCH #', 'Item Name', ...vendors.map(v => `${v.vendor_name} Case $`), 'Best Save $'].join(',')
    const csvRows = filtered.map(r => {
      const vals = vendors.map(v => r.prices[v.vendor_id]).filter((v): v is number => v !== null)
      const saving = vals.length >= 2 ? (Math.max(...vals) - Math.min(...vals)).toFixed(2) : ''
      return [r.internal_item_number, `"${r.internal_item_name}"`, ...vendors.map(v => r.prices[v.vendor_id] != null ? (r.prices[v.vendor_id] as number).toFixed(2) : ''), saving].join(',')
    })
    const blob = new Blob([[headers, ...csvRows].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `OCH_price_comparison_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  }

  if (rows.length === 0) {
    return (
      <div style={{ background: C.beigeLight, border: `1px solid ${C.border}`, borderRadius: 12, padding: '2.5rem', textAlign: 'center', fontFamily: 'var(--font-sans)', color: C.textMuted, fontSize: '0.82rem', lineHeight: 1.8 }}>
        <div style={{ fontSize: '1.75rem', opacity: 0.25, marginBottom: '0.5rem' }}>⚖</div>
        No manually mapped items yet.<br />
        Use the <strong>Run AI Match</strong> button above to auto-compare all uploaded items.
      </div>
    )
  }

  const inputStyle: React.CSSProperties = { background: C.surface, color: C.text, border: `1px solid ${C.borderMid}`, borderRadius: 8, padding: '7px 12px', fontFamily: 'var(--font-sans)', fontSize: '0.82rem', outline: 'none' }

  return (
    <div>
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.72rem', color: C.textMuted, marginBottom: '0.75rem' }}>
        Manually mapped items ({rows.length})
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <input type="text" placeholder="Search…" value={search} onChange={e => onSearchChange(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
        <select value={mode} onChange={e => onModeChange(e.target.value as Mode)} style={inputStyle}>
          <option value="all">All items</option>
          <option value="savings">Best savings (&gt;$2)</option>
          <option value="missing">Missing from a vendor</option>
        </select>
        <button onClick={exportCSV} style={{ ...inputStyle, cursor: 'pointer', fontWeight: 600, fontSize: '0.72rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>↓ CSV</button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'Items shown', value: String(filtered.length) },
          { label: 'Avg savings', value: stats.avgSave ? `$${stats.avgSave.toFixed(2)}` : '—' },
          { label: 'Total save', value: `$${stats.totalSave.toFixed(2)}` },
          { label: 'Vendors', value: String(vendors.length) },
        ].map(s => (
          <div key={s.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.85rem 1rem' }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.58rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, color: C.primaryDim, marginBottom: 5 }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', color: C.primary, lineHeight: 1, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 + vendors.length * 130 }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: 110, textAlign: 'left', borderRight: `1px solid rgba(255,255,255,0.12)` }}>Internal #</th>
              <th style={{ ...TH, textAlign: 'left', borderRight: `1px solid rgba(255,255,255,0.12)` }}>Item</th>
              {vendors.map((v, i) => <th key={v.vendor_id} style={{ ...TH, textAlign: 'center', width: 130, borderRight: i < vendors.length - 1 ? `1px solid rgba(255,255,255,0.12)` : undefined }}>{v.vendor_name}</th>)}
              <th style={{ ...TH, width: 100, textAlign: 'center' }}>Best Save</th>
            </tr>
            <tr>
              <th style={{ ...SUB_TH, textAlign: 'left', borderRight: `1px solid ${C.border}` }}>OCH code</th>
              <th style={{ ...SUB_TH, textAlign: 'left', borderRight: `1px solid ${C.border}` }}>Description</th>
              {vendors.map((v, i) => <th key={v.vendor_id} style={{ ...SUB_TH, textAlign: 'center', borderRight: i < vendors.length - 1 ? `1px solid ${C.border}` : undefined }}>Case $</th>)}
              <th style={{ ...SUB_TH, textAlign: 'center' }}>vs highest</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={3 + vendors.length} style={{ textAlign: 'center', padding: '2.5rem', color: C.textMuted, fontFamily: 'var(--font-sans)', fontSize: '0.82rem' }}>No items match your filters.</td></tr>
            ) : filtered.map((r, idx) => {
              const caseVals = vendors.map(v => r.prices[v.vendor_id]).filter((v): v is number => v !== null)
              const minCase = caseVals.length ? Math.min(...caseVals) : null
              const maxCase = caseVals.length ? Math.max(...caseVals) : null
              const saving = minCase !== null && maxCase !== null && caseVals.length > 1 ? maxCase - minCase : 0
              return (
                <tr key={r.internal_item_id} style={{ borderBottom: idx < filtered.length - 1 ? `1px solid ${C.border}` : undefined, background: idx % 2 === 0 ? C.surface : C.bg }}>
                  <td style={{ ...TD, borderRight: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>
                    <span style={{ color: C.primary, fontWeight: 600, letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums' }}>{r.internal_item_number}</span>
                  </td>
                  <td style={{ ...TD, borderRight: `1px solid ${C.border}`, maxWidth: 280 }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.88rem', color: C.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.internal_item_name}</div>
                  </td>
                  {vendors.map((v, i) => {
                    const price = r.prices[v.vendor_id]
                    const isMin = price !== null && price === minCase && caseVals.length > 1
                    return (
                      <td key={v.vendor_id} style={{ ...TD, textAlign: 'center', fontVariantNumeric: 'tabular-nums', borderRight: i < vendors.length - 1 ? `1px solid ${C.border}` : undefined }}>
                        {price !== null ? isMin ? (
                          <span style={{ display: 'inline-block', background: C.lowestBg, color: C.lowestText, border: `1px solid ${C.lowestBorder}`, borderRadius: 5, padding: '2px 9px', fontWeight: 600, fontSize: '0.82rem' }}>${price.toFixed(2)}</span>
                        ) : (
                          <span style={{ color: C.textMid }}>${price.toFixed(2)}</span>
                        ) : <span style={{ color: C.borderMid }}>—</span>}
                      </td>
                    )
                  })}
                  <td style={{ ...TD, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                    {saving > 0 ? <span style={{ color: '#059669', fontWeight: 600 }}>${saving.toFixed(2)}</span> : <span style={{ color: C.borderMid }}>—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
