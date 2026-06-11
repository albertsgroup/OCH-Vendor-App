import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  // Verify caller is admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { vendor_name, email, password } = await request.json()

  if (!vendor_name || !email || !password) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Create auth user with vendor role in app_metadata
  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    app_metadata: { role: 'vendor', vendor_name },
    email_confirm: true, // skip email confirmation
  })

  if (createError || !newUser.user) {
    return NextResponse.json(
      { error: createError?.message ?? 'Failed to create user.' },
      { status: 400 }
    )
  }

  // Upsert profile row (trigger should create it, but upsert as safety)
  await adminClient
    .from('profiles')
    .upsert({
      id: newUser.user.id,
      role: 'vendor',
      vendor_name,
      is_active: true,
    })

  // Fetch the created profile to return to client
  const { data: vendorProfile } = await adminClient
    .from('profiles')
    .select('id, vendor_name, is_active, created_at')
    .eq('id', newUser.user.id)
    .single()

  return NextResponse.json({ vendor: vendorProfile })
}
