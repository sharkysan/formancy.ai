import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AngularBuilderPage } from './angular-builder-page.js'

const root = document.getElementById('root')
if (root === null) throw new Error('No #root in angular-form-builder/index.html')
createRoot(root).render(
  <StrictMode>
    <AngularBuilderPage />
  </StrictMode>,
)
