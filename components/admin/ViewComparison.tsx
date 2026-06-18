'use client'

import { useState, useMemo } from 'react'
import type { ComparisonRow, VendorSummary } from '@/types/database'

const B = {
  bg:        '#150E05',
  surface:   '#1C1209',
  surface2:  '#211508',
  border:    '#3A2208',
  border2:   '#4A3010',
  amber:     '#C8841A',
  amberDim:  '#6B4E27',
  textBright:'#E8D5A3',
  textMid:   '#C9A96E',
  textDim:   '#6B4E27',
  green:     '#2D5016',
  greenText: '#97C459',
  greenBorder:'#639922',
}

const inputStyle: React.CSSProperties = {
  background: B.surface,
  color: B.textBright,
  border: `1px solid ${B.border2}`,
  borderRadius: 6,
  padding: '7px 12px',
  fontFamily: '"DM Mono", monospace',
  fontSize: '0.75rem',
  letterSpacing: '0.04em',
  outline: 'none',
}

const TH: React.CSSProperties = {
  padding: '10px 12px 6px',
  fontFamily: '"DM Mono", monospace',
  fontSize: '0.65rem',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: B.amber,
  borderBottom: `1px solid ${B.border}`,
  background: B.bg,
  whiteSpace: 'nowrap',
}

const SUB_TH: React.CSSProperties = {
  padding: '5px 12px 8px',
  fontFamily: '"DM Mono", monospace',
  fontSize: '0.56rem',
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: B.amberDim,
  borderBottom: `1px solid ${B.border}`,
  background: B.surface,
  whiteSpace: 'nowrap',
}

const TD: React.CSSProperties = {
  padding: '9px 12px',
  color: B.textMid,
  verticalAlign: 'middle',
  fontFamily: '"DM Mono", monospace',
  fontSize: '0.72rem',
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
        background: B.surface,
        border: `1px solid ${B.border}`,
        borderRadius: 10,
        padding: '3rem',
        textAlign: 'center',
        fontFamily: '"DM Mono", monospace',
        color: B.amberDim,
        fontSize: '0.75rem',
        letterSpacing: '0.1em',
        lineHeight: 1.8,
      }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem', color: B.border2 }}>⚖</div>
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
            border: `1px solid ${B.amber}`,
            color: B.amber,
            borderRadius: 6,
            padding: '7px 16px',
            fontFamily: '"DM Mono", monospace',
            fontSize: '0.68rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          ↓ Export CSV
        </button>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Items shown',          value: String(filtered.length) },
          { label: 'Avg case savings',     value: stats.avgSave ? `$${stats.avgSave.toFixed(2)}` : '—' },
          { label: 'Total potential save',  value: `$${stats.totalSave.toFixed(2)}` },
          { label: 'Vendors compared',     value: String(vendors.length) },
        ].map(s => (
          <div key={s.label} style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 8, padding: '0.9rem 1rem' }}>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '0.56rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: B.amberDim, marginBottom: 5 }}>
              {s.label}
            </div>
            <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '1.55rem', color: B.amber, lineHeight: 1 }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Legend ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', alignItems: 'center', marginBottom: '0.85rem', fontFamily: '"DM Mono", monospace', fontSize: '0.62rem', letterSpacing: '0.08em', color: B.amberDim }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: B.green, border: `1px solid ${B.greenBorder}`, display: 'inline-block' }} />
          Lowest price
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: B.surface, border: `1px solid ${B.border}`, display: 'inline-block' }} />
          Not carried
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ overflowX: 'auto', border: `1px solid ${B.border}`, borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 + vendors.length * 120 }}>
          <thead>

            {/* ── Group header row ── */}
            <tr>
              <th style={{ ...TH, width: 100, textAlign: 'left', borderRight: `1px solid ${B.border}` }}>
                Internal #
              </th>
              <th style={{ ...TH, textAlign: 'left', borderRight: `1px solid ${B.border}` }}>
                Item
              </th>
              {vendors.map((v, i) => (
                <th
                  key={v.vendor_id}
                  style={{ ...TH, textAlign: 'center', width: 120, borderRight: i < vendors.length - 1 ? `1px solid ${B.border}` : undefined }}
                >
                  {v.vendor_name}
                </th>
              ))}
              <th style={{ ...TH, width: 100, textAlign: 'center' }}>
                Best Save
              </th>
            </tr>

            {/* ── Sub-header row ── */}
            <tr>
              <th style={{ ...SUB_TH, textAlign: 'left', borderRight: `1px solid ${B.border}` }}>OCH code</th>
              <th style={{ ...SUB_TH, textAlign: 'left', borderRight: `1px solid ${B.border}` }}>Description</th>
              {vendors.map((v, i) => (
                <th
                  key={v.vendor_id}
                  style={{ ...SUB_TH, textAlign: 'center', borderRight: i < vendors.length - 1 ? `1px solid ${B.border}` : undefined }}
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
                  style={{ textAlign: 'center', padding: '3rem', color: B.amberDim, fontFamily: '"DM Mono", monospace', fontSize: '0.73rem', letterSpacing: '0.1em' }}
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
                  style={{ borderBottom: rowIdx < filtered.length - 1 ? `1px solid #241608` : undefined }}
                >
                  {/* OCH # */}
                  <td style={{ ...TD, borderRight: `1px solid ${B.border}`, whiteSpace: 'nowrap' }}>
                    <span style={{ color: B.amber, fontFamily: '"DM Mono", monospace', fontWeight: 500, letterSpacing: '0.04em' }}>
                      {r.internal_item_number}
                    </span>
                  </td>

                  {/* Item name */}
                  <td style={{ ...TD, borderRight: `1px solid ${B.border}`, maxWidth: 280 }}>
                    <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '0.85rem', color: B.textBright, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                        style={{ ...TD, textAlign: 'center', fontVariantNumeric: 'tabular-nums', borderRight: i < vendors.length - 1 ? `1px solid ${B.border}` : undefined }}
                      >
                        {price !== null ? (
                          isMin ? (
                            <span style={{ display: 'inline-block', background: B.green, color: B.greenText, borderRadius: 4, padding: '2px 8px', fontWeight: 500, fontSize: '0.72rem' }}>
                              ${price.toFixed(2)}
                            </span>
                          ) : (
                            <span style={{ color: B.textMid }}>${price.toFixed(2)}</span>
                          )
                        ) : (
                          <span style={{ color: B.border2 }}>—</span>
                        )}
                      </td>
                    )
                  })}

                  {/* Best save */}
                  <td style={{ ...TD, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                    {saving > 0 ? (
                      <span style={{ color: B.greenText, fontWeight: 500 }}>${saving.toFixed(2)}</span>
                    ) : (
                      <span style={{ color: B.border2 }}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer summary ── */}
      {filtered.length > 0 && (
        <div style={{ marginTop: '0.75rem', fontFamily: '"DM Mono", monospace', fontSize: '0.6rem', letterSpacing: '0.1em', color: B.amberDim, textAlign: 'right' }}>
          {filtered.length} item{filtered.length !== 1 ? 's' : ''} · {vendors.length} vendor{vendors.length !== 1 ? 's' : ''}
          {mode !== 'all' ? ` · filtered: ${mode}` : ''}
        </div>
      )}
    </div>
  )
}
