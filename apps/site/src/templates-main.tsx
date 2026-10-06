import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TemplateGallery } from './template-gallery.js'

const root = document.getElementById('root')
if (root === null) throw new Error('No #root in templates/index.html')
createRoot(root).render(<StrictMode><TemplateGallery /></StrictMode>)
