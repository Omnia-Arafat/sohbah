import { cache } from 'react'
import { getAcademyBySlug } from './academy-dal'
import type { Academy } from './academy-dal'

/**
 * Get academy context from slug
 * This should be called in server components and passed down as needed
 */
export const getAcademyContext = cache(async (slug: string): Promise<Academy | null> => {
  return await getAcademyBySlug(slug)
})
