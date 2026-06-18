import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'OCH Vendor Pricing',
  description: 'Old City Hall Brewery — Vendor Pricing Portal',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Mono:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
