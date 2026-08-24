import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { cache } from 'react'
import type { Academy } from '@/lib/database.types'

export type { Academy }

/**
 * Fetch all active academies
 * Cached per request
 */
export const getAcademies = cache(async (): Promise<Academy[]> => {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('academies')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Failed to fetch academies:', error)
    return []
  }

  return data as Academy[]
})

/**
 * Fetch a single academy by slug
 * Cached per request
 */
export const getAcademyBySlug = cache(async (slug: string): Promise<Academy | null> => {
  const supabase = await createClient()
  
  const { data } = await supabase
    .rpc('get_academy', { p_slug: slug })

  if (!data || data.length === 0) {
    return null
  }

  return data[0] as Academy
})

/**
 * Check if an academy exists and is active
 */
export async function academyExists(slug: string): Promise<boolean> {
  const academy = await getAcademyBySlug(slug)
  return academy !== null && academy.is_active
}
