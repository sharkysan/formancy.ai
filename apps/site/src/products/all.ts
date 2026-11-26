import { DATA } from './data.js'
import { HEALTH } from './health.js'
import type { Product } from './product.js'
import { REPORT } from './report.js'

/**
 * The product pages, by the id each `products/<id>/index.html` names on its root, in the
 * order the footer and the sitemap list the modules. The build renders each of them to
 * static HTML (`prerender.mjs`), and the browser takes each over from its id.
 */
export const PRODUCTS: Readonly<Record<Product['page'], Product>> = { data: DATA, report: REPORT, health: HEALTH }

/** Whether a root's `data-product` names a product page, and which. */
export function productOf(id: string | undefined): Product {
  const product = id === 'data' || id === 'report' || id === 'health' ? PRODUCTS[id] : undefined
  if (product === undefined) throw new Error(`No product page is called ${JSON.stringify(id)}: the root's data-product names data, report or health.`)
  return product
}
