import { mount } from './mount.js'
import { TemplateGallery } from './template-gallery.js'

const root = document.getElementById('root')
if (root === null) throw new Error('No #root in templates/index.html')
// The build has written the gallery into its root, every template's card with it (0243).
mount(root, <TemplateGallery />)
