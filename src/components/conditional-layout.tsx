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
  
  // Check if we're in an academy route.
  // A locale-prefixed path looks like /en/sohbah/... and a bare path like
  // /sohbah/... — in both cases the academy slug sits at segment index 1 or 2.
  // We detect it by checking whether any path segment matches 'sohbah'.
  const segments = pathname.split('/').filter(Boolean)
  const isAcademyRoute = segments.includes('sohbah')
  
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
