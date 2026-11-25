import type { ReactElement } from 'react'
import { Mark } from './chrome.js'
import { DataExample } from './module-examples/data.js'
import { HealthExample } from './module-examples/health.js'
import { ReportExample } from './module-examples/report.js'
import type { Variant } from './module-examples/variant.js'
import type { Product } from './products/product.js'
import { TERMS } from './products/product.js'
import './og-card.css'
import './product-page.css'
import './product-og-card.css'

/**
 * The card a chat app or a search result shows when somebody shares a paid module's product
 * page (0242), as `og-card.tsx` is the landing page's: a route, not an export. Reached only
 * with `?og` on the page (`product-main.tsx`), and turned into `public/products/<id>/og.png`
 * by screenshotting `#og-card`, as `docs/images/README.md` says.
 *
 * **Its words are the page's own**: the module's name, and the promise its page's heading
 * makes, rendered from the same `Product` rather than typed again, since a card written
 * apart from the page outlived two rewrites of the landing page's headline before anybody
 * noticed. And it says the module's terms, because a shared card is read alone, beside a
 * site whose free offer is the first thing it says (0179).
 *
 * Beside the words, the module's example, the landing page's crop of it, drawn by the same
 * component: on the site's card the picture is a real form, and here it is what the module
 * makes. Its caption is not drawn: the image's `og:image:alt` says what it shows. A module
 * whose promise names HL7's marks carries HL7's sentence at the foot, as its page does.
 *
 * Exactly 1200x630, the size Open Graph asks for, which `.og-card` declares.
 */

/** Each module's example, by its page's id, so a card cannot show another module's. */
const SKETCHES: Readonly<Record<Product['page'], (props: { variant: Variant }) => ReactElement>> = {
  data: DataExample,
  report: ReportExample,
  health: HealthExample,
}

export function ProductOgCard({ product }: { product: Product }): ReactElement {
  const Sketch = SKETCHES[product.page]

  return (
    <div className="og-card og-product" id="og-card" data-product={product.page}>
      <div className="og-backdrop" aria-hidden="true" />
      <div className="og-words">
        <p className="og-brand">
          <Mark />
          formancy.ai
        </p>
        <p className="og-product-name">{product.name}</p>
        <h1>{product.h1}</h1>
        <p className="og-tags">
          <span>{TERMS}</span>
          <span>Source-available</span>
        </p>
      </div>
      <div className="og-product-sketch">
        <Sketch variant="card" />
      </div>
      {product.mark !== undefined && <p className="og-product-mark">{product.mark}</p>}
    </div>
  )
}
