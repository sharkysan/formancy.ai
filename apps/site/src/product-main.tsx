import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { ProductOgCard } from './product-og-card.js'
import { ProductPage } from './product-page.js'
import { productOf } from './products/all.js'

/**
 * A product page in the browser (0242). The build has already written the page into its
 * root (`prerender.mjs`), so React takes over the markup the server sent rather than
 * drawing it again; the development server writes nothing there, so it draws it. Which
 * page it is comes from the root's `data-product`, which each `index.html` names.
 *
 * `?og` draws the module's share card instead, as `?og` on the landing page draws the
 * site's (`main.tsx`). The root holds the page the build wrote, so it is emptied first.
 * `docs/images/README.md` says how the card becomes the page's `og:image`.
 */
const root = document.getElementById('root')
if (root === null) throw new Error('No #root in this product page')

const product = productOf(root.dataset.product)

if (new URLSearchParams(window.location.search).has('og')) {
  root.replaceChildren()
  createRoot(root).render(
    <StrictMode>
      <ProductOgCard product={product} />
    </StrictMode>,
  )
} else {
  const page = (
    <StrictMode>
      <ProductPage product={product} />
    </StrictMode>
  )
  if (root.firstElementChild === null) createRoot(root).render(page)
  else hydrateRoot(root, page)
}
