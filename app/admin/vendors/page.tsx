import { createClient } from '@/lib/supabase/server'
import VendorManager from '@/components/admin/VendorManager'

export const dynamic = 'force-dynamic'

export default async function AdminVendors() {
  const supabase = await createClient()

  const { data: vendors } = await supabase
    .from('profiles')
    .select('id, vendor_name, is_active, created_at')
    .eq('role', 'vendor')
    .order('vendor_name')

  const activeCount = vendors?.filter(v => v.is_active).length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manage Vendors</h1>
        <p className="text-gray-500 mt-1">
          {activeCount} active vendor{activeCount !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="card p-5 border-l-4 border-l-amber-500">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-800">How it works:</span>{' '}
          Create a login for each vendor below. Share their email and temporary password with them directly —
          they log in using the <span className="font-medium">Vendor Login</span> tab on the login page.
          Vendors can only see their own prices, never each other's.
        </p>
      </div>

      <VendorManager initialVendors={vendors ?? []} />
    </div>
  )
}
