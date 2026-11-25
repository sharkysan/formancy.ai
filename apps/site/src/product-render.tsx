import { renderToString } from 'react-dom/server'
import { ProductPage } from './product-page.js'
import { PRODUCTS, productOf } from './products/all.js'

/**
 * The product pages as static HTML (0242), for `prerender.mjs` to write into the pages the
 * build made, so that what they say is in the HTML the server sends and not only in what a
 * script draws: being found is what the pages are for, and a crawler that runs no script
 * reads an empty root otherwise, as it does on the landing page.
 *
 * Built by Vite for Node (`vite build --ssr`), with the same plugins, defines and imports
 * as the pages' own build, so the markup is what the browser draws over it; the browser
 * gate fails a page whose markup React had to correct.
 */

/** Every product page the build renders, by the id its root names. */
export const PRODUCT_IDS: readonly string[] = Object.keys(PRODUCTS)

/** A product page's markup, for inside its root. */
export function renderProduct(id: string): string {
  return renderToString(<ProductPage product={productOf(id)} />)
}
