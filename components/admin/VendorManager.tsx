'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Vendor {
  id: string
  vendor_name: string | null
  is_active: boolean
  created_at: string
}

interface Props {
  initialVendors: Vendor[]
}

interface NewVendorResult {
  vendor_name: string
  email: string
  tempPassword: string
}

export default function VendorManager({ initialVendors }: Props) {
  const [vendors, setVendors] = useState<Vendor[]>(initialVendors)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createdVendor, setCreatedVendor] = useState<NewVendorResult | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError('')
    setCreating(true)

    const res = await fetch('/api/admin/create-vendor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendor_name: name.trim(), email: email.trim(), password }),
    })

    const result = await res.json()

    if (!res.ok) {
      setCreateError(result.error ?? 'Failed to create vendor.')
      setCreating(false)
      return
    }

    setVendors(prev => [...prev, result.vendor].sort((a: Vendor, b: Vendor) =>
      (a.vendor_name ?? '').localeCompare(b.vendor_name ?? '')
    ))
    setCreatedVendor({ vendor_name: name, email, tempPassword: password })
    setName('')
    setEmail('')
    setPassword('')
    setShowForm(false)
    setCreating(false)
  }

  function startEdit(vendor: Vendor) {
    setEditingId(vendor.id)
    setEditingName(vendor.vendor_name ?? '')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingName('')
  }

  async function handleSaveEdit(vendor: Vendor) {
    if (!editingName.trim()) return
    setSavingEdit(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .update({ vendor_name: editingName.trim() })
      .eq('id', vendor.id)

    if (!error) {
      setVendors(prev =>
        prev.map(v => v.id === vendor.id ? { ...v, vendor_name: editingName.trim() } : v)
          .sort((a, b) => (a.vendor_name ?? '').localeCompare(b.vendor_name ?? ''))
      )
      setEditingId(null)
      setEditingName('')
    }
    setSavingEdit(false)
  }

  async function handleToggleActive(vendor: Vendor) {
    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: !vendor.is_active })
      .eq('id', vendor.id)

    if (!error) {
      setVendors(prev => prev.map(v => v.id === vendor.id ? { ...v, is_active: !v.is_active } : v))
    }
  }

  return (
    <div className="space-y-6">
      {/* Created credentials banner */}
      {createdVendor && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-green-800">Vendor account created!</p>
              <p className="text-sm text-green-700 mt-1">Share these credentials with <strong>{createdVendor.vendor_name}</strong>:</p>
              <div className="mt-2 font-mono text-sm bg-white border border-green-200 rounded-lg p-3 space-y-1">
                <div><span className="text-gray-500">Email:</span> <span className="font-semibold">{createdVendor.email}</span></div>
                <div><span className="text-gray-500">Password:</span> <span className="font-semibold">{createdVendor.tempPassword}</span></div>
              </div>
              <p className="text-xs text-green-600 mt-2">Save these credentials now — the password won't be shown again.</p>
            </div>
            <button onClick={() => setCreatedVendor(null)} className="text-green-600 hover:text-green-800 ml-4">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Add vendor */}
      {showForm ? (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">New Vendor Account</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Company / Vendor Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Hop Supply Co."
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label">Login Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="vendor@example.com"
                  className="input"
                  required
                />
              </div>
            </div>

            <div>
              <label className="label">Temporary Password</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Set a temporary password"
                  className="input font-mono"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setPassword(generatePassword())}
                  className="btn-secondary whitespace-nowrap text-xs"
                >
                  Generate
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Share this with the vendor. They can change it after logging in.</p>
            </div>

            {createError && <p className="text-red-600 text-sm">{createError}</p>}

            <div className="flex gap-3">
              <button type="submit" disabled={creating} className="btn-primary">
                {creating ? 'Creating...' : 'Create Vendor Account'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Vendor
        </button>
      )}

      {/* Vendor list */}
      <div className="table-container">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="th">Vendor Name</th>
              <th className="th w-24 text-center">Status</th>
              <th className="th w-28 text-right">Added</th>
              <th className="th w-48 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {vendors.length === 0 ? (
              <tr>
                <td colSpan={4} className="td text-center text-gray-400 py-8">
                  No vendors yet. Add your first vendor above.
                </td>
              </tr>
            ) : vendors.map(vendor => (
              <tr key={vendor.id} className="hover:bg-gray-50">
                <td className="td">
                  {editingId === vendor.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveEdit(vendor)
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      className="input text-sm w-full max-w-xs"
                      autoFocus
                    />
                  ) : (
                    <span className="font-medium">{vendor.vendor_name ?? '—'}</span>
                  )}
                </td>
                <td className="td text-center">
                  {vendor.is_active
                    ? <span className="badge-success">Active</span>
                    : <span className="badge-gray">Disabled</span>}
                </td>
                <td className="td text-right text-gray-400 text-xs">
                  {new Date(vendor.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                  })}
                </td>
                <td className="td text-right">
                  <div className="flex justify-end gap-2">
                    {editingId === vendor.id ? (
                      <>
                        <button
                          onClick={() => handleSaveEdit(vendor)}
                          disabled={savingEdit || !editingName.trim()}
                          className="btn-primary text-xs px-2.5 py-1"
                        >
                          {savingEdit ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="btn-secondary text-xs px-2.5 py-1"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(vendor)}
                          className="btn-secondary text-xs px-2.5 py-1"
                        >
                          Edit Name
                        </button>
                        <button
                          onClick={() => handleToggleActive(vendor)}
                          className={`text-xs px-2.5 py-1 rounded-lg border font-semibold transition-colors ${
                            vendor.is_active
                              ? 'border-red-200 text-red-600 hover:bg-red-50'
                              : 'border-green-200 text-green-600 hover:bg-green-50'
                          }`}
                        >
                          {vendor.is_active ? 'Disable' : 'Enable'}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
