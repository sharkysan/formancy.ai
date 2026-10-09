import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app.js'
import { initialDirection } from './demos.js'

// On the document rather than on a pane, so the form, both builders and the
// playground's own chrome all read the same way, as they would on a host's page.
document.documentElement.dir = initialDirection(window.location.search)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
