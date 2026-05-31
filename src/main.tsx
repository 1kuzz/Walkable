import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { I18nProvider } from './i18n'

// When a VIP viewer page reloads (URL became '/' due to history patch fallback),
// restore the session instead of landing on the main portal.
const __vpSession = sessionStorage.getItem('__vp');
if (__vpSession) {
  const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (navEntry?.type === 'reload' || navEntry?.type === 'back_forward') {
    sessionStorage.removeItem('__vp');
    window.location.replace(__vpSession + '/');
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
