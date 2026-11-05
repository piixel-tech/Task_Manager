import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { removeLegacyServiceWorkers } from './utils/removeServiceWorkers'

// An earlier version could be installed as an app with a service worker. That feature is gone: remove the worker (and its icon badge) from browsers that still have it.
removeLegacyServiceWorkers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
