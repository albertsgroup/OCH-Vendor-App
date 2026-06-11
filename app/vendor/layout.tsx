import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import VendorNav from '@/components/vendor/VendorNav'

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, vendor_name, is_active')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'vendor') redirect('/login')
  if (!profile.is_active) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      <VendorNav vendorName={profile.vendor_name ?? 'Vendor'} />
      <main className="max-w-5xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}
