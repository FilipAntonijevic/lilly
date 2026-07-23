import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyChainDocumentMeta } from './config/chain'
import { LanguageProvider } from './i18n/LanguageContext'
import './index.css'
import App from './App.tsx'

applyChainDocumentMeta()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
)
