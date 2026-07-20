import { useLanguage } from '../i18n/LanguageContext'

interface LanguageToggleProps {
  className?: string
}

export function LanguageToggle({ className = '' }: LanguageToggleProps) {
  const { locale, setLocale, t } = useLanguage()

  return (
    <div
      className={`lang-toggle ${className}`.trim()}
      role="group"
      aria-label={t('lang.toggle')}
    >
      <button
        type="button"
        className={locale === 'sr' ? 'is-active' : undefined}
        aria-pressed={locale === 'sr'}
        onClick={() => setLocale('sr')}
      >
        {t('lang.sr')}
      </button>
      <button
        type="button"
        className={locale === 'en' ? 'is-active' : undefined}
        aria-pressed={locale === 'en'}
        onClick={() => setLocale('en')}
      >
        {t('lang.en')}
      </button>
    </div>
  )
}
