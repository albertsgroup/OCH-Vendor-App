import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const ADMIN_USER_ID = '04531664-68f8-4353-8306-ea5818017778'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  if (!user && path !== '/login' && !path.startsWith('/api/health')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user) {
    // The designated admin ID always gets admin role — no DB query needed
    const isAdmin = user.id === ADMIN_USER_ID

    if (path === '/login' || path === '/') {
      const dest = isAdmin ? '/admin/dashboard' : '/vendor/dashboard'
      return NextResponse.redirect(new URL(dest, request.url))
    }

    if (isAdmin && path.startsWith('/vendor')) {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url))
    }

    if (!isAdmin && path.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/vendor/dashboard', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
