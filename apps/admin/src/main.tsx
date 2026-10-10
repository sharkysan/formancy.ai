import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loader } from '@monaco-editor/react'
import { App } from './app.js'
import { MONACO_VS } from './monaco-path.js'

// Monaco from this deployment, before anything asks for it. The loader's default is
// jsDelivr, which told a CDN the address of every operator who opened the editor (0154).
loader.config({ paths: { vs: `${import.meta.env.BASE_URL}${MONACO_VS}` } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
