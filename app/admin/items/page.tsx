import { createClient } from '@/lib/supabase/server'
import ItemManager from '@/components/admin/ItemManager'

export const dynamic = 'force-dynamic'

export default async function AdminItems() {
  const supabase = await createClient()

  const { data: items } = await supabase
    .from('items')
    .select('id, item_number, item_name, is_active, created_at')
    .order('item_number')

  const activeCount = items?.filter(i => i.is_active).length ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manage Items</h1>
          <p className="text-gray-500 mt-1">
            {activeCount} active item{activeCount !== 1 ? 's' : ''} — vendors will price everything marked active
          </p>
        </div>
      </div>

      <div className="card p-5 border-l-4 border-l-amber-500">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-800">How it works:</span>{' '}
          Add an item with its Item # and name below. All active items will appear on each vendor's pricing form every week.
          Deactivate an item to hide it from vendors without deleting it.
        </p>
      </div>

      <ItemManager initialItems={items ?? []} />
    </div>
  )
}
