import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { getBranding, hexToHslTriplet } from '@/lib/branding'

import './globals.css'

const sans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding()
  return {
    title: branding.name ?? 'Bridge Dashboard',
    description: 'Operational dashboard for the Hypixel chat bridge.',
    // An admin surface has no business in a search index.
    robots: { index: false, follow: false }
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const accent = hexToHslTriplet((await getBranding()).accent)
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen" style={accent ? ({ '--accent': accent, '--ring': accent } as React.CSSProperties) : undefined}>
        {children}
      </body>
    </html>
  )
}
