'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ViewGrouped from './ViewGrouped'
import ViewComparison from './ViewComparison'
import ViewCart from './ViewCart'
import type { GroupedRow, ComparisonRow, VendorSummary, CartItem, MatchGroup } from '@/types/database'
import { formatWeekRange } from '@/lib/utils/week'

interface Props {
  groupedRows: GroupedRow[]
  comparisonRows: ComparisonRow[]
  vendors: VendorSummary[]
  availableWeeks: string[]
  selectedWeek: string
  currentWeek: string
  weekLabel: string
}

type ViewMode = 'grouped' | 'comparison' | 'cart'

export default function DashboardClient({
  groupedRows,
  comparisonRows,
  vendors,
  availableWeeks,
  selectedWeek,
  currentWeek,
  weekLabel,
}: Props) {
  const router = useRouter()
  const [view, setView] = useState<ViewMode>('grouped')
  const [, startTransition] = useTransition()

  // Cart — persists across tab switches
  const [cartItems, setCartItems] = useState<CartItem[]>([])

  // AI match — persists across tab switches
  const [matchGroups, setMatchGroups] = useState<MatchGroup[] | null>(null)

  function handleWeekChange(week: string) {
    startTransition(() => {
      router.push(`/admin/dashboard?week=${week}`)
    })
  }

  // Cart operations
  function addToCart(item: CartItem) {
    setCartItems(prev => {
      const existing = prev.find(c => c.rowId === item.rowId)
      if (existing) {
        return prev.map(c => c.rowId === item.rowId ? { ...c, quantity: c.quantity + 1 } : c)
      }
      return [...prev, item]
    })
  }

  function updateQuantity(rowId: string, quantity: number) {
    setCartItems(prev => prev.map(c => c.rowId === rowId ? { ...c, quantity } : c))
  }

  function removeFromCart(rowId: string) {
    setCartItems(prev => prev.filter(c => c.rowId !== rowId))
  }

  function clearCart() {
    setCartItems([])
  }

  const cartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0)
  const vendorsWithUploads = vendors.filter(v => v.upload_id)
  const vendorsWithout    = vendors.filter(v => !v.upload_id)

  const tabs: { id: ViewMode; label: string; badge?: string }[] = [
    { id: 'grouped',    label: 'View 1 — By Vendor' },
    { id: 'comparison', label: 'View 2 — Price Comparison' },
    { id: 'cart',       label: 'Cart', badge: cartCount > 0 ? String(cartCount) : undefined },
  ]

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

      {/* Tab bar */}
      <div className="inline-flex rounded-lg border border-light-grey-300 bg-white overflow-hidden shadow-sm">
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={`px-4 py-2 text-sm font-semibold transition-colors flex items-center gap-2 ${
              i > 0 ? 'border-l border-light-grey-300' : ''
            } ${
              view === tab.id
                ? 'bg-primary text-white'
                : 'text-primary-300 hover:bg-secondary-100'
            }`}
          >
            {tab.label}
            {tab.badge && (
              <span className={`inline-flex items-center justify-center rounded-full text-xs font-bold w-5 h-5 ${
                view === tab.id ? 'bg-white text-primary' : 'bg-primary text-white'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Active view */}
      {view === 'grouped' && (
        <ViewGrouped
          rows={groupedRows}
          vendors={vendors}
          cartItems={cartItems}
          onAddToCart={addToCart}
        />
      )}

      {view === 'comparison' && (
        <ViewComparison
          rows={comparisonRows}
          vendors={vendors}
          selectedWeek={selectedWeek}
          matchGroups={matchGroups}
          onMatchComplete={setMatchGroups}
          onClearMatch={() => setMatchGroups(null)}
        />
      )}

      {view === 'cart' && (
        <ViewCart
          items={cartItems}
          selectedWeek={selectedWeek}
          onUpdateQuantity={updateQuantity}
          onRemove={removeFromCart}
          onClear={clearCart}
        />
      )}
    </div>
  )
}
