import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import './globals.css'

const sans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })

export const metadata: Metadata = {
  title: 'Bridge Dashboard',
  description: 'Operational dashboard for the Hypixel chat bridge.',
  // An admin surface has no business in a search index.
  robots: { index: false, follow: false }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
