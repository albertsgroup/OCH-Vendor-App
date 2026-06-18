'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils/cn'

interface Props {
  vendorName: string
}

export default function VendorNav({ vendorName }: Props) {
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
      href: '/vendor/dashboard',
      label: 'Submit Pricing',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      ),
    },
    {
      href: '/vendor/history',
      label: 'My History',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ]

  return (
    <header className="bg-white border-b border-light-grey-200 shadow-sm sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">

          {/* Brand */}
          <div className="flex items-center gap-3">
            <Image
              src="/och-logo-dark.svg"
              alt="Old City Hall BBQ"
              width={36}
              height={36}
              className="h-8 w-auto"
            />
            <div className="leading-tight">
              <p className="text-xs font-heading text-primary tracking-wide hidden sm:block">Old City Hall BBQ</p>
              {vendorName && (
                <p className="text-[10px] text-light-grey-500 tracking-wide">{vendorName}</p>
              )}
            </div>
          </div>

          {/* Nav links */}
          <nav className="flex items-center gap-1">
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  pathname === link.href
                    ? 'bg-secondary text-primary'
                    : 'text-light-grey-500 hover:text-primary hover:bg-secondary-100'
                )}
              >
                {link.icon}
                <span className="hidden sm:block">{link.label}</span>
              </Link>
            ))}
          </nav>

          <button
            onClick={handleLogout}
            className="text-sm text-light-grey-400 hover:text-primary transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            <span className="hidden sm:block">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  )
}
