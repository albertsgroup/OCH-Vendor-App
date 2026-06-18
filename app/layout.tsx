import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'

const dmSans = localFont({
  src: [
    { path: '../public/fonts/DMSans-Variable.ttf',        style: 'normal' },
    { path: '../public/fonts/DMSans-Italic-Variable.ttf', style: 'italic' },
  ],
  variable: '--font-sans',
  display: 'swap',
})

const libreBaskerville = localFont({
  src: [
    { path: '../public/fonts/LibreBaskerville-Variable.ttf',        style: 'normal' },
    { path: '../public/fonts/LibreBaskerville-Italic-Variable.ttf', style: 'italic' },
  ],
  variable: '--font-heading',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'OCH Vendor Pricing',
  description: 'Old City Hall Brewery — Vendor Pricing Portal',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${libreBaskerville.variable}`}>
      <body>{children}</body>
    </html>
  )
}
