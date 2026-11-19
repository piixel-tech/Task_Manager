import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { removeLegacyServiceWorkers } from './utils/removeServiceWorkers'

// An earlier version could be installed as an app with an offline-caching service worker. That feature is gone: remove those workers (and the icon badge). The notifications-only worker /sw.js is kept.
removeLegacyServiceWorkers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
