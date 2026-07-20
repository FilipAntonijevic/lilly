import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  translate,
  type Locale,
  type MessageKey,
  type TranslateFn,
} from './messages'

const STORAGE_KEY = 'lilly.locale'

interface LanguageContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: TranslateFn
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function readStoredLocale(): Locale {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'en' || raw === 'sr') return raw
  } catch {
    /* ignore */
  }
  return 'sr'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale())

  useEffect(() => {
    document.documentElement.lang = locale === 'sr' ? 'sr' : 'en'
    try {
      localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      /* ignore */
    }
  }, [locale])

  const value = useMemo<LanguageContextValue>(() => {
    const t: TranslateFn = (key, vars) => translate(locale, key, vars)
    return {
      locale,
      setLocale: setLocaleState,
      t,
    }
  }, [locale])

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return ctx
}

export function useT(): TranslateFn {
  return useLanguage().t
}

export type { Locale, MessageKey }
