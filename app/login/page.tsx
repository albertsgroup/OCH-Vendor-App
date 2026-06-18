'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

const ADMIN_USER_ID = '04531664-68f8-4353-8306-ea5818017778'

type Tab = 'vendor' | 'admin'

export default function LoginPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('vendor')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleTabChange(next: Tab) {
    setTab(next)
    setError('')
    setEmail('')
    setPassword('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError || !data.user) {
      setError('Invalid email or password.')
      setLoading(false)
      return
    }

    if (tab === 'admin') {
      if (data.user.id !== ADMIN_USER_ID) {
        await supabase.auth.signOut()
        setError('This account does not have admin access.')
        setLoading(false)
        return
      }
      router.push('/admin/dashboard')
      router.refresh()
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', data.user.id)
      .single()

    if (!profile || profile.role !== 'vendor') {
      await supabase.auth.signOut()
      setError('This account is not a vendor account. Use the Admin login tab.')
      setLoading(false)
      return
    }

    if (!profile.is_active) {
      await supabase.auth.signOut()
      setError('Your account has been disabled. Contact Old City Hall Brewery.')
      setLoading(false)
      return
    }

    router.push('/vendor/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-och-black px-4">
      <div className="w-full max-w-sm">

        {/* Logo + wordmark */}
        <div className="text-center mb-8 flex flex-col items-center gap-3">
          <Image
            src="/och-logo-white.svg"
            alt="Old City Hall BBQ"
            width={72}
            height={72}
            className="h-18 w-auto"
            priority
          />
          <div>
            <p className="font-heading text-secondary text-xl tracking-wide">Old City Hall BBQ</p>
            <p className="text-light-grey-400 text-xs tracking-widest uppercase mt-0.5">Vendor Pricing Portal</p>
          </div>
        </div>

        {/* Card */}
        <div className="card overflow-hidden">

          {/* Tabs */}
          <div className="grid grid-cols-2 border-b border-light-grey-200">
            <button
              onClick={() => handleTabChange('vendor')}
              className={`py-3 text-sm font-semibold transition-colors ${
                tab === 'vendor'
                  ? 'bg-white text-primary border-b-2 border-primary'
                  : 'bg-secondary-50 text-light-grey-500 hover:text-primary-400'
              }`}
            >
              Vendor Login
            </button>
            <button
              onClick={() => handleTabChange('admin')}
              className={`py-3 text-sm font-semibold transition-colors ${
                tab === 'admin'
                  ? 'bg-white text-primary border-b-2 border-primary'
                  : 'bg-secondary-50 text-light-grey-500 hover:text-primary-400'
              }`}
            >
              Admin Login
            </button>
          </div>

          {/* Form */}
          <div className="p-6">
            <p className="text-xs text-light-grey-400 mb-5">
              {tab === 'vendor'
                ? 'Sign in to submit your weekly pricing.'
                : 'Brewery staff access only.'}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="label">Email address</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="label">Password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in…
                  </>
                ) : tab === 'vendor' ? 'Sign in as Vendor' : 'Sign in as Admin'}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-xs text-light-grey-500 mt-6">
          Old City Hall Brewery &mdash; Vendor Pricing Portal
        </p>
      </div>
    </div>
  )
}
