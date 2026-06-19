import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminNav from '@/components/admin/AdminNav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') redirect('/login')

  return (
    <div className="min-h-screen bg-secondary-50">
      <AdminNav />
      <main className="md:ml-56 pt-14 pb-20 md:pb-0">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
