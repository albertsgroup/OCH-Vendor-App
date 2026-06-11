import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'OCH Vendor Pricing',
  description: 'Old City Hall Brewery — Vendor Pricing Portal',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
