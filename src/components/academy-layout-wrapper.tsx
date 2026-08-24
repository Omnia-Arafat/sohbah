'use client'

import { useEffect } from 'react'

export function AcademyLayoutWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Hide parent layout's header and footer when in academy routes
    const body = document.body
    const header = body.querySelector('body > div > header')
    const footer = body.querySelector('body > div > footer')
    const main = body.querySelector('body > div > main')
    
    if (header) (header as HTMLElement).style.display = 'none'
    if (footer) (footer as HTMLElement).style.display = 'none'
    if (main) (main as HTMLElement).style.padding = '0'
    
    return () => {
      if (header) (header as HTMLElement).style.display = ''
      if (footer) (footer as HTMLElement).style.display = ''
      if (main) (main as HTMLElement).style.padding = ''
    }
  }, [])

  return <>{children}</>
}
