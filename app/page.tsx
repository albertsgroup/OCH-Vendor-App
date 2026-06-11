import { redirect } from 'next/navigation'

// Middleware handles the redirect, but this is a safety fallback
export default function Home() {
  redirect('/login')
}
