'use client'

import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'

type ConditionalLayoutProps = {
  header: ReactNode
  footer: ReactNode
  children: ReactNode
}

export function ConditionalLayout({ header, footer, children }: ConditionalLayoutProps) {
  const pathname = usePathname()
  
  // Check if we're in an academy route
  // Patterns: /itqan/*, /sohbah/*, /ar/itqan/*, /en/sohbah/*, etc.
  // Academy slugs are: itqan, sohbah (from database)
  const isAcademyRoute = pathname.includes('/itqan') || pathname.includes('/sohbah')
  
  // If in academy route, don't render header/footer (academy layout handles it)
  if (isAcademyRoute) {
    return <>{children}</>
  }
  
  // Otherwise, render with header and footer
  return (
    <>
      {header}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        {children}
      </main>
      {footer}
    </>
  )
}
