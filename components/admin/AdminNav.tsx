'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils/cn'

export default function AdminNav() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const links = [
    {
      href: '/admin/dashboard',
      label: 'Weekly Report',
      badge: 0,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      ),
    },
    {
      href: '/admin/items',
      label: 'Manage Items',
      badge: 0,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    },
    {
      href: '/admin/vendors',
      label: 'Manage Vendors',
      badge: 0,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      ),
    },
  ]

  return (
    <>
      {/* ── Top bar ── */}
      <header className="bg-och-black text-white h-14 flex items-center px-5 gap-4 shadow-md no-print fixed top-0 left-0 right-0 z-20">
        <div className="flex items-center gap-3 flex-1">
          <Image
            src="/och-logo-white.svg"
            alt="Old City Hall BBQ"
            width={36}
            height={36}
            className="h-8 w-auto"
          />
          <div className="leading-tight">
            <p className="text-xs font-heading text-secondary-300 tracking-wide">Old City Hall</p>
            <p className="text-[10px] text-light-grey-400 tracking-widest uppercase">Vendor Pricing Portal</p>
          </div>
          <span className="ml-2 text-[10px] bg-secondary text-primary font-semibold px-2 py-0.5 rounded tracking-wide uppercase">
            Admin
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-light-grey-400 hover:text-white transition-colors flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
          <span className="hidden sm:block">Sign out</span>
        </button>
      </header>

      {/* ── Sidebar ── */}
      <aside className="fixed top-14 left-0 h-[calc(100vh-3.5rem)] w-56 bg-primary flex flex-col no-print hidden md:flex z-10">
        <nav className="flex-1 p-3 space-y-0.5 pt-4">
          {links.map(link => {
            const active = pathname === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                  active
                    ? 'bg-secondary text-primary shadow-sm'
                    : 'text-light-grey-200 hover:text-white hover:bg-primary-600'
                )}
              >
                {link.icon}
                <span className="flex-1">{link.label}</span>
                {link.badge > 0 && (
                  <span className="bg-amber-400 text-och-black text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                    {link.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Sidebar footer with logo */}
        <div className="p-4 border-t border-primary-600">
          <div className="flex items-center gap-2.5">
            <Image
              src="/och-logo-white.svg"
              alt="OCH"
              width={28}
              height={28}
              className="h-7 w-auto opacity-40"
            />
            <div>
              <p className="text-xs text-light-grey-300 font-heading">Old City Hall BBQ</p>
              <p className="text-[10px] text-primary-300 mt-0.5">Logged in as Admin</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Mobile bottom nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-primary border-t border-primary-600 flex md:hidden no-print z-20">
        {links.map(link => {
          const active = pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors',
                active ? 'text-secondary' : 'text-primary-300'
              )}
            >
              {link.icon}
              <span className="text-[10px]">{link.label.split(' ')[0]}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
