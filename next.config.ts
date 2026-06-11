import type { NextConfig } from 'next'
import { readFileSync } from 'fs'
import { join } from 'path'

// Workaround: Next.js 16 Turbopack does not reliably expose server-only
// env vars (without NEXT_PUBLIC_ prefix) to API routes at runtime.
// We read .env.local directly here and inject the key via the `env` block,
// which gets embedded as a literal in the server bundle.
function readEnvLocal(): Record<string, string> {
  try {
    const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
    const result: Record<string, string> = {}
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim()
      result[key] = val
    }
    return result
  } catch {
    return {}
  }
}

const localEnv = readEnvLocal()

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [],
  },
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || localEnv.ANTHROPIC_API_KEY || '',
  },
}

export default nextConfig
