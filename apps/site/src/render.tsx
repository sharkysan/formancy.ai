import { StrictMode } from 'react'
import type { ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { AngularBuilderPage } from './angular-builder-page.js'
import { App } from './app.js'
import { ProductPage } from './product-page.js'
import { PRODUCTS, productOf } from './products/all.js'
import { TemplateGallery } from './template-gallery.js'

/**
 * Every page of the site's own build as static HTML, for `prerender.mjs` to write into the
 * pages Vite made, so that what each says is in the HTML the server sends and not only in
 * what a script draws: a crawler or a link preview that runs no script reads the root as it
 * was sent. The product pages were first, because being found is what they are for (0242);
 * the landing page, the templates gallery and the Angular page followed (0243).
 *
 * Built by Vite for Node (`vite build --ssr`), with the same plugins, defines and imports
 * as the pages' own build, so the markup is what the browser draws over it. Each page's
 * entry takes it over with `mount` (`mount.tsx`), which hydrates the same tree this renders,
 * `<StrictMode>` included; the browser gate fails a page whose markup React had to correct or
 * draw again. A live form renders its first state here, with nothing typed: what it does when
 * somebody types needs its script, as it always did.
 */

/** A page the build renders. */
export interface StaticPage {
  /** Its directory under `dist`, `/`-separated, whose `index.html` it is: `''` for the landing page. */
  readonly page: string
  /** The empty root its `index.html` writes, which `prerender.mjs` writes the markup into. */
  readonly root: string
  /**
   * The page, as its entry hands it to `mount` too. Written twice, here and in the entry, by
   * convention: a prop given in one and not the other renders another tree, which the browser
   * gate finds in the page's text and elements and nothing finds in an attribute alone.
   */
  readonly element: () => ReactElement
}

/** Every page `prerender.mjs` renders, the landing page first and the product pages in the order the footer links the modules. */
export const STATIC_PAGES: readonly StaticPage[] = [
  { page: '', root: '<div id="root"></div>', element: () => <App /> },
  { page: 'templates', root: '<div id="root"></div>', element: () => <TemplateGallery /> },
  { page: 'angular-form-builder', root: '<div id="root"></div>', element: () => <AngularBuilderPage /> },
  ...Object.keys(PRODUCTS).map((id) => ({
    page: `products/${id}`,
    root: `<div id="root" data-product="${id}"></div>`,
    element: () => <ProductPage product={productOf(id)} />,
  })),
]

/** A page's markup, for inside its root: the tree `mount` hydrates, `<StrictMode>` and all. */
export function renderPage(page: StaticPage): string {
  return renderToString(<StrictMode>{page.element()}</StrictMode>)
}
