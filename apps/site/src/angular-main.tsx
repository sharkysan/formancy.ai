import { AngularBuilderPage } from './angular-builder-page.js'
import { mount } from './mount.js'

const root = document.getElementById('root')
if (root === null) throw new Error('No #root in angular-form-builder/index.html')
// The build has written the page into its root (0243).
mount(root, <AngularBuilderPage />)
