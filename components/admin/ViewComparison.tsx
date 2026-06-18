'use client'

import { useState, useMemo } from 'react'
import type { ComparisonRow, VendorSummary } from '@/types/database'

// OCH brand tokens (inline — not Tailwind, since table cells need dynamic per-cell styles)
const C = {
  bg:          '#fdfcfa',
  surface:     '#ffffff',
  border:      '#e2ddd7',
  borderMid:   '#d1cbc1',
  primary:     '#3e4b54',
  primaryDim:  '#7f8e98',
  primaryLight:'#ebeef0',
  beige:       '#f0ece2',
  beigeLight:  '#f8f5ef',
  dark:        '#263139',
  text:        '#263139',
  textMid:     '#3e4b54',
  textMuted:   '#a8b2b9',
  lowestBg:    '#d1fae5',
  lowestText:  '#065f46',
  lowestBorder:'#6ee7b7',
}

const inputStyle: React.CSSProperties = {
  background: C.surface,
  color: C.text,
  border: `1px solid ${C.borderMid}`,
  borderRadius: 8,
  padding: '7px 12px',
  fontFamily: 'var(--font-sans)',
  fontSize: '0.82rem',
  outline: 'none',
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
  color: C.textMid,
  verticalAlign: 'middle',
  fontFamily: 'var(--font-sans)',
  fontSize: '0.82rem',
}

interface Props {
  rows: ComparisonRow[]
  vendors: VendorSummary[]
}

type Mode = 'all' | 'savings' | 'missing'

export default function ViewComparison({ rows, vendors }: Props) {
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<Mode>('all')

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
      data = data.filter(r =>
        vendors.some(v => r.prices[v.vendor_id] == null)
      )
    }

    return data
  }, [rows, search, mode, vendors])

  const stats = useMemo(() => {
    let totalSave = 0
    let saveCount = 0
    filtered.forEach(r => {
      const vals = vendors.map(v => r.prices[v.vendor_id]).filter((v): v is number => v !== null)
      if (vals.length >= 2) {
        totalSave += Math.max(...vals) - Math.min(...vals)
        saveCount++
      }
    })
    return { totalSave, avgSave: saveCount ? totalSave / saveCount : 0 }
  }, [filtered, vendors])

  function exportCSV() {
    const headers = [
      'OCH #', 'Item Name',
      ...vendors.map(v => `${v.vendor_name} Case $`),
      'Best Save $',
    ].join(',')

    const csvRows = filtered.map(r => {
      const vals = vendors.map(v => r.prices[v.vendor_id]).filter((v): v is number => v !== null)
      const saving = vals.length >= 2 ? (Math.max(...vals) - Math.min(...vals)).toFixed(2) : ''
      return [
        r.internal_item_number,
        `"${r.internal_item_name}"`,
        ...vendors.map(v => r.prices[v.vendor_id] != null ? (r.prices[v.vendor_id] as number).toFixed(2) : ''),
        saving,
      ].join(',')
    })

    const csv = [headers, ...csvRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `OCH_price_comparison_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (rows.length === 0) {
    return (
      <div style={{
        background: C.beigeLight,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: '3rem',
        textAlign: 'center',
        fontFamily: 'var(--font-sans)',
        color: C.textMuted,
        fontSize: '0.82rem',
        lineHeight: 1.8,
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem', opacity: 0.3 }}>⚖</div>
        No comparable data yet.
        <br />
        Upload order guides and map vendor items to internal catalogue items to see price comparisons.
      </div>
    )
  }

  return (
    <div style={{ padding: '0.25rem 0 2rem' }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '1.25rem' }}>
        <input
          type="text"
          placeholder="Search item or OCH number…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
        />
        <select
          value={mode}
          onChange={e => setMode(e.target.value as Mode)}
          style={inputStyle}
        >
          <option value="all">All items</option>
          <option value="savings">Best savings only (&gt;$2 diff)</option>
          <option value="missing">Missing from a vendor</option>
        </select>
        <button
          onClick={exportCSV}
          style={{
            background: 'transparent',
            border: `1px solid ${C.borderMid}`,
            color: C.textMid,
            borderRadius: 8,
            padding: '7px 16px',
            fontFamily: 'var(--font-sans)',
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          ↓ Export CSV
        </button>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Items shown',          value: String(filtered.length) },
          { label: 'Avg case savings',     value: stats.avgSave ? `$${stats.avgSave.toFixed(2)}` : '—' },
          { label: 'Total potential save',  value: `$${stats.totalSave.toFixed(2)}` },
          { label: 'Vendors compared',     value: String(vendors.length) },
        ].map(s => (
          <div key={s.label} style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: '1rem 1.1rem',
          }}>
            <div style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.6rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontWeight: 600,
              color: C.primaryDim,
              marginBottom: 6,
            }}>
              {s.label}
            </div>
            <div style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.65rem',
              color: C.primary,
              lineHeight: 1,
              fontWeight: 700,
            }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Legend ── */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1.25rem',
        alignItems: 'center',
        marginBottom: '0.85rem',
        fontFamily: 'var(--font-sans)',
        fontSize: '0.7rem',
        color: C.textMuted,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: C.lowestBg, border: `1px solid ${C.lowestBorder}`, display: 'inline-block' }} />
          Lowest price
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: C.beigeLight, border: `1px solid ${C.borderMid}`, display: 'inline-block' }} />
          Not carried
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 1px 3px rgba(38,49,57,0.06)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 + vendors.length * 130 }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: 110, textAlign: 'left', borderRight: `1px solid rgba(255,255,255,0.12)` }}>
                Internal #
              </th>
              <th style={{ ...TH, textAlign: 'left', borderRight: `1px solid rgba(255,255,255,0.12)` }}>
                Item
              </th>
              {vendors.map((v, i) => (
                <th
                  key={v.vendor_id}
                  style={{ ...TH, textAlign: 'center', width: 130, borderRight: i < vendors.length - 1 ? `1px solid rgba(255,255,255,0.12)` : undefined }}
                >
                  {v.vendor_name}
                </th>
              ))}
              <th style={{ ...TH, width: 100, textAlign: 'center' }}>
                Best Save
              </th>
            </tr>

            <tr>
              <th style={{ ...SUB_TH, textAlign: 'left', borderRight: `1px solid ${C.border}` }}>OCH code</th>
              <th style={{ ...SUB_TH, textAlign: 'left', borderRight: `1px solid ${C.border}` }}>Description</th>
              {vendors.map((v, i) => (
                <th
                  key={v.vendor_id}
                  style={{ ...SUB_TH, textAlign: 'center', borderRight: i < vendors.length - 1 ? `1px solid ${C.border}` : undefined }}
                >
                  Case $
                </th>
              ))}
              <th style={{ ...SUB_TH, textAlign: 'center' }}>vs highest</th>
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={3 + vendors.length}
                  style={{ textAlign: 'center', padding: '3rem', color: C.textMuted, fontFamily: 'var(--font-sans)', fontSize: '0.82rem' }}
                >
                  No items match your filters.
                </td>
              </tr>
            ) : filtered.map((r, rowIdx) => {
              const caseVals = vendors
                .map(v => r.prices[v.vendor_id])
                .filter((v): v is number => v !== null)
              const minCase = caseVals.length ? Math.min(...caseVals) : null
              const maxCase = caseVals.length ? Math.max(...caseVals) : null
              const saving = minCase !== null && maxCase !== null && caseVals.length > 1
                ? maxCase - minCase
                : 0

              return (
                <tr
                  key={r.internal_item_id}
                  style={{
                    borderBottom: rowIdx < filtered.length - 1 ? `1px solid ${C.border}` : undefined,
                    background: rowIdx % 2 === 0 ? C.surface : C.bg,
                  }}
                >
                  {/* OCH # */}
                  <td style={{ ...TD, borderRight: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>
                    <span style={{ color: C.primary, fontWeight: 600, letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums' }}>
                      {r.internal_item_number}
                    </span>
                  </td>

                  {/* Item name */}
                  <td style={{ ...TD, borderRight: `1px solid ${C.border}`, maxWidth: 280 }}>
                    <div style={{
                      fontFamily: 'var(--font-heading)',
                      fontSize: '0.88rem',
                      color: C.dark,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {r.internal_item_name}
                    </div>
                  </td>

                  {/* Vendor prices */}
                  {vendors.map((v, i) => {
                    const price = r.prices[v.vendor_id]
                    const isMin = price !== null && price === minCase && caseVals.length > 1
                    return (
                      <td
                        key={v.vendor_id}
                        style={{ ...TD, textAlign: 'center', fontVariantNumeric: 'tabular-nums', borderRight: i < vendors.length - 1 ? `1px solid ${C.border}` : undefined }}
                      >
                        {price !== null ? (
                          isMin ? (
                            <span style={{
                              display: 'inline-block',
                              background: C.lowestBg,
                              color: C.lowestText,
                              border: `1px solid ${C.lowestBorder}`,
                              borderRadius: 5,
                              padding: '2px 9px',
                              fontWeight: 600,
                              fontSize: '0.82rem',
                            }}>
                              ${price.toFixed(2)}
                            </span>
                          ) : (
                            <span style={{ color: C.textMid }}>${price.toFixed(2)}</span>
                          )
                        ) : (
                          <span style={{ color: C.borderMid }}>—</span>
                        )}
                      </td>
                    )
                  })}

                  {/* Best save */}
                  <td style={{ ...TD, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                    {saving > 0 ? (
                      <span style={{ color: '#059669', fontWeight: 600 }}>${saving.toFixed(2)}</span>
                    ) : (
                      <span style={{ color: C.borderMid }}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer ── */}
      {filtered.length > 0 && (
        <div style={{
          marginTop: '0.75rem',
          fontFamily: 'var(--font-sans)',
          fontSize: '0.65rem',
          letterSpacing: '0.06em',
          color: C.textMuted,
          textAlign: 'right',
        }}>
          {filtered.length} item{filtered.length !== 1 ? 's' : ''} · {vendors.length} vendor{vendors.length !== 1 ? 's' : ''}
          {mode !== 'all' ? ` · filtered: ${mode}` : ''}
        </div>
      )}
    </div>
  )
}
