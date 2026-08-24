'use client'

import { useTranslations } from 'next-intl'
import Image from 'next/image'
import Link from 'next/link'
import { getAcademyNameFromMessages } from '@/lib/academy-display'

type Academy = {
  id: string
  slug: string
  name_ar: string
  name_en: string
  description_ar: string | null
  description_en: string | null
  logo_path: string | null
  primary_color: string
  accent_color: string
}

type Props = {
  academies: Academy[]
  locale: string
}

export function AcademySelector({ academies, locale }: Props) {
  const t = useTranslations()
  const tAcademy = useTranslations('academy')

  return (
    <div className="py-12">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-12 text-center">
          <h1 className="font-display text-4xl sm:text-5xl mb-4">
            {t('academy.select')}
          </h1>
          <p className="text-muted-foreground text-lg">
            {t('app.description')}
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          {academies.map((academy) => {
            const name = getAcademyNameFromMessages(
              academy.slug,
              locale,
              academy,
              tAcademy,
            )
            const description = locale === 'ar' ? academy.description_ar : academy.description_en

            return (
              <Link
                key={academy.id}
                href={`/${academy.slug}`}
                className="group relative overflow-hidden rounded-2xl bg-surface p-8 shadow-md transition-all hover:shadow-xl hover:scale-[1.02]"
                style={{
                  borderTop: `4px solid ${academy.primary_color}`,
                }}
              >
                <div className="flex flex-col items-center gap-6">
                  {academy.logo_path && (
                    <div className="relative h-24 w-24">
                      <Image
                        src={academy.logo_path}
                        alt={name}
                        fill
                        className="object-contain"
                      />
                    </div>
                  )}
                  
                  <div className="text-center">
                    <h2 className="font-display text-3xl mb-2">
                      {name}
                    </h2>
                    {description && (
                      <p className="text-muted-foreground">
                        {description}
                      </p>
                    )}
                  </div>

                  <div
                    className="mt-4 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-white font-medium transition-colors"
                    style={{
                      backgroundColor: academy.primary_color,
                    }}
                  >
                    {t('nav.home')}
                    <svg
                      className="h-5 w-5 rtl:rotate-180"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </div>

                <div
                  className="absolute inset-0 -z-10 opacity-5 transition-opacity group-hover:opacity-10"
                  style={{
                    background: `radial-gradient(circle at top right, ${academy.primary_color}, transparent 70%)`,
                  }}
                />
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
