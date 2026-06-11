import { NextResponse } from 'next/server'
export async function GET() {
  return NextResponse.json({
    anthropic_key_set: !!process.env.ANTHROPIC_API_KEY,
    anthropic_key_prefix: process.env.ANTHROPIC_API_KEY?.slice(0, 14) ?? 'NOT SET',
    supabase_service_set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabase_service_prefix: process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 10) ?? 'NOT SET',
    node_env: process.env.NODE_ENV,
  })
}
