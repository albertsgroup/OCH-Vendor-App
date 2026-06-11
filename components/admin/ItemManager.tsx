'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Item } from '@/types/database'

interface Props {
  initialItems: Item[]
}

type EditingItem = { id: string; item_number: string; item_name: string }

export default function ItemManager({ initialItems }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<Item[]>(initialItems)
  const [newNumber, setNewNumber] = useState('')
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [editing, setEditing] = useState<EditingItem | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newNumber.trim() || !newName.trim()) return
    setAdding(true)
    setAddError('')

    const supabase = createClient()
    const { data, error } = await supabase
      .from('items')
      .insert({ item_number: newNumber.trim(), item_name: newName.trim() })
      .select()
      .single()

    if (error) {
      setAddError(error.code === '23505' ? 'Item number already exists.' : 'Failed to add item.')
      setAdding(false)
      return
    }

    setItems(prev => [...prev, data].sort((a, b) => a.item_number.localeCompare(b.item_number)))
    setNewNumber('')
    setNewName('')
    setAdding(false)
  }

  async function handleSaveEdit() {
    if (!editing) return
    setSaving(true)

    const supabase = createClient()
    const { error } = await supabase
      .from('items')
      .update({ item_number: editing.item_number.trim(), item_name: editing.item_name.trim() })
      .eq('id', editing.id)

    if (error) {
      setSaving(false)
      return
    }

    setItems(prev =>
      prev.map(i => i.id === editing.id ? { ...i, ...editing } : i)
        .sort((a, b) => a.item_number.localeCompare(b.item_number))
    )
    setEditing(null)
    setSaving(false)
  }

  async function handleToggleActive(item: Item) {
    const supabase = createClient()
    const { error } = await supabase
      .from('items')
      .update({ is_active: !item.is_active })
      .eq('id', item.id)

    if (!error) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !i.is_active } : i))
    }
  }

  return (
    <div className="space-y-6">
      {/* Add item form */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Add New Item</h2>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div className="w-36">
            <label className="label">Item Number</label>
            <input
              type="text"
              value={newNumber}
              onChange={e => setNewNumber(e.target.value)}
              placeholder="e.g. HOPS-001"
              className="input"
              required
            />
          </div>
          <div className="flex-1 min-w-48">
            <label className="label">Item Name</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Cascade Hops 1lb"
              className="input"
              required
            />
          </div>
          <button type="submit" disabled={adding} className="btn-primary">
            {adding ? 'Adding...' : 'Add Item'}
          </button>
        </form>
        {addError && <p className="text-red-600 text-sm mt-2">{addError}</p>}
      </div>

      {/* Items table */}
      <div className="table-container">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="th w-36">Item Number</th>
              <th className="th">Item Name</th>
              <th className="th w-24 text-center">Status</th>
              <th className="th w-36 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="td text-center text-gray-400 py-8">
                  No items yet. Add your first item above.
                </td>
              </tr>
            ) : items.map(item => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="td">
                  {editing?.id === item.id ? (
                    <input
                      type="text"
                      value={editing.item_number}
                      onChange={e => setEditing(prev => prev ? { ...prev, item_number: e.target.value } : null)}
                      className="input text-sm w-full"
                    />
                  ) : (
                    <span className="font-mono text-gray-500">{item.item_number}</span>
                  )}
                </td>
                <td className="td">
                  {editing?.id === item.id ? (
                    <input
                      type="text"
                      value={editing.item_name}
                      onChange={e => setEditing(prev => prev ? { ...prev, item_name: e.target.value } : null)}
                      className="input text-sm w-full"
                    />
                  ) : (
                    <span className="font-medium">{item.item_name}</span>
                  )}
                </td>
                <td className="td text-center">
                  {item.is_active
                    ? <span className="badge-success">Active</span>
                    : <span className="badge-gray">Inactive</span>}
                </td>
                <td className="td text-right">
                  <div className="flex justify-end gap-2">
                    {editing?.id === item.id ? (
                      <>
                        <button
                          onClick={handleSaveEdit}
                          disabled={saving}
                          className="btn-primary text-xs px-2.5 py-1"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="btn-secondary text-xs px-2.5 py-1"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setEditing({ id: item.id, item_number: item.item_number, item_name: item.item_name })}
                          className="btn-secondary text-xs px-2.5 py-1"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(item)}
                          className={`text-xs px-2.5 py-1 rounded-lg border font-semibold transition-colors ${
                            item.is_active
                              ? 'border-red-200 text-red-600 hover:bg-red-50'
                              : 'border-green-200 text-green-600 hover:bg-green-50'
                          }`}
                        >
                          {item.is_active ? 'Deactivate' : 'Activate'}
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
