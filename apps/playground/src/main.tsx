import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loader } from '@monaco-editor/react'
import { App } from './app.js'
import { initialDirection } from './demos.js'
import { MONACO_VS } from './monaco-path.js'

// Monaco from this site, before anything asks for it. The loader's default is jsDelivr,
// which told a CDN the address of everybody who opened the playground (0154).
loader.config({ paths: { vs: `${import.meta.env.BASE_URL}${MONACO_VS}` } })

// On the document rather than on a pane, so the form, both builders and the
// playground's own chrome all read the same way, as they would on a host's page.
document.documentElement.dir = initialDirection(window.location.search)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
