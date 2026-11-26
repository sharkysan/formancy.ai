import { mount, replace } from './mount.js'
import { ProductOgCard } from './product-og-card.js'
import { ProductPage } from './product-page.js'
import { productOf } from './products/all.js'

/**
 * A product page in the browser (0242). The build has already written the page into its
 * root (`prerender.mjs`), so `mount` takes over the markup the server sent rather than
 * drawing it again, as on every page of the site (0243). Which page it is comes from the
 * root's `data-product`, which each `index.html` names.
 *
 * `?og` draws the module's share card instead, as `?og` on the landing page draws the
 * site's (`main.tsx`), in place of the page the build wrote into the root.
 * `docs/images/README.md` says how the card becomes the page's `og:image`.
 */
const root = document.getElementById('root')
if (root === null) throw new Error('No #root in this product page')

const product = productOf(root.dataset.product)

if (new URLSearchParams(window.location.search).has('og')) replace(root, <ProductOgCard product={product} />)
else mount(root, <ProductPage product={product} />)
