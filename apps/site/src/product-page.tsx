import type { ReactElement, ReactNode } from 'react'
import { Backdrop, SiteBar, SiteFooter } from './chrome.js'
import type { Product } from './products/product.js'
import { READ_ON, TERMS, askAbout, github, longDate } from './products/product.js'
import './product-page.css'

/**
 * A paid module's product page (0242): `/products/data/`, `/products/report/` and
 * `/products/health/`, for the visitor and the search that lands on one, in the site's one
 * shell (formancy.ai 0106) — the same bar, backdrop and footer as every other page.
 *
 * Its words are in the HTML the server sends: the build renders this component to static
 * HTML into each page (`prerender.mjs`), and the browser takes the page over without
 * drawing it again (`product-main.tsx`). One layout for the three, and one file of words
 * each under `products/`, so that every page says its terms in the same places.
 *
 * **Every link to the module sits in a group that says its terms**, named by them, so a
 * person who tabs to the link hears "not free, paid in production" before its name, and
 * the group shows the same words. That is 0179's rule for a page whose every word is about
 * a paid module: a link is often reached alone. `product-page.test.tsx` holds every such
 * link to it, as `site.test.tsx` holds the landing page's. A link to another module, as
 * Health's to Report, sits in a group named by that module's terms, not this one's.
 *
 * **It ends on what a buyer does next**: the demonstration, and a question about a production
 * licence, the two together under the terms, rather than on the licence's table.
 *
 * **It has no part on what the module does not do yet** (0245): the module's own pages say
 * that, and the page links them. Its status stands alone, across the page as the parts
 * around it do, rather than as half of a row whose other half is gone.
 */

export function ProductPage({ product }: { product: Product }): ReactElement {
  const [demo, second, ...more] = product.ctas
  const buttons = [demo, second].filter((link) => link !== undefined)

  return (
    <div className="product-page" data-product={product.page}>
      <Backdrop />
      <a className="skip" href="#start">
        Skip to content
      </a>
      <SiteBar current={product.page} />

      <main id="start" tabIndex={-1}>
        <section className="product-hero" aria-labelledby="product-title">
          <p className="eyebrow">{product.name} · built on formancy</p>
          <h1 id="product-title">{product.h1}</h1>
          <p className="lede">{product.lede}</p>
          <Offer name={product.name} className="product-offer-hero">
            <p className="product-actions">
              {buttons.map((link, index) => (
                <a key={link.href} className={index === 0 ? 'action primary' : 'action'} href={link.href}>
                  {link.label}
                </a>
              ))}
            </p>
            {more.length > 0 && (
              <ul className="product-links" aria-label="More about it">
                {more.map((link) => (
                  <li key={link.href}>
                    <a href={link.href}>{link.label}</a>
                  </li>
                ))}
              </ul>
            )}
            <p className="product-terms">
              <strong>{TERMS}.</strong> Reading the source, evaluating, developing and testing are free, in a company too. No published price yet: ask at{' '}
              <a href={askAbout(product.name)}>info@formancy.ai</a>.
            </p>
          </Offer>
        </section>

        <Part id="makes" title="What it makes" className="product-example">
          {product.example.figure}
          <Offer name={product.name} className="product-real">
            <p>
              <a href={product.example.real.href}>{product.example.real.label}</a>
              <span className="product-terms-inline">{TERMS}</span>
            </p>
          </Offer>
        </Part>

        <Part id="does" title="What it does">
          <ul className="product-cards">
            {product.capabilities.map((capability) => (
              <li key={capability.label}>
                <h3>{capability.label}</h3>
                <p>{capability.detail}</p>
              </li>
            ))}
          </ul>
          <Offer name={product.name} className="product-further">
            <p>{product.further.lede}</p>
            <ul aria-label={`In ${product.name}’s own pages`}>
              {product.further.links.map((link) => (
                <li key={link.href}>
                  <a href={link.href}>{link.label}</a>
                </li>
              ))}
            </ul>
            <p className="product-terms-inline">{TERMS}</p>
          </Offer>
        </Part>

        <Part id="jobs" title="What teams use it for">
          <ul className="product-jobs">
            {product.jobs.map((job, index) => (
              // A fixed list drawn once, so its place is its identity.
              <li key={index}>{job}</li>
            ))}
          </ul>
        </Part>

        <div className="product-duo">
          <Part id="for" title="Who it is for">
            <p>{product.whoFor}</p>
          </Part>
          <Part id="fits" title="How it fits with formancy">
            {product.fits.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
            {product.related !== undefined && (
              <Offer name={product.related.name} className="product-real">
                <p>
                  <a href={product.related.link.href}>{product.related.link.label}</a>
                  <span className="product-terms-inline">{TERMS}</span>
                </p>
              </Offer>
            )}
          </Part>
        </div>

        <Part id="status" title="Status">
          <p className="product-release">
            <span>Release</span> <strong>{product.release.version}</strong> <span>of {longDate(product.release.date)}</span>
            {product.release.preview && <span className="product-preview">developer preview</span>}
          </p>
          <p>{product.release.said}</p>
          <Dated />
        </Part>

        <Part id="terms" title="Terms">
          <p>
            Source-available, not open source: the licence is {product.name}’s own, not formancy’s Apache-2.0. {product.licence.line}
          </p>
          <table className="product-table">
            <caption className="visually-hidden">{product.name}’s licence, in one table</caption>
            <thead>
              <tr>
                <th scope="col">Use</th>
                <th scope="col">Terms</th>
              </tr>
            </thead>
            <tbody>
              {product.licence.rows.map(([use, terms]) => (
                <tr key={use}>
                  <th scope="row">{use}</th>
                  <td data-free={terms === 'Free' ? '' : undefined}>{terms}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>{product.licence.howToBuy}</p>
          <Offer name={product.name} className="product-licence">
            <p>
              <a href={github(product.repository, 'LICENSE.md')}>The licence in full, on GitHub</a>
              <span className="product-terms-inline">{TERMS}</span>
              <a href={askAbout(product.name)}>info@formancy.ai</a>
            </p>
          </Offer>
          {product.mark !== undefined && <p className="product-mark">{product.mark}</p>}
        </Part>

        <Part id="next" title="Try it, then ask about production" className="product-next">
          <p>Trying it, building with it and testing it cost nothing. Running it in production needs a licence, and there is no published price yet.</p>
          <Offer name={product.name} className="product-offer-next">
            <p className="product-actions">
              {demo !== undefined && (
                <a className="action primary" href={demo.href}>
                  {demo.label}
                </a>
              )}
              <a className="action" href={askAbout(product.name)}>
                Ask about a production licence
              </a>
            </p>
            <p className="product-terms-inline">{TERMS}</p>
          </Offer>
        </Part>
      </main>

      <SiteFooter />
    </div>
  )
}

/** A part of the page, named by its heading. */
function Part({ id, title, className, children }: { id: string; title: string; className?: string; children: ReactNode }): ReactElement {
  return (
    <section id={id} className={className === undefined ? 'product-section' : `product-section ${className}`} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      {children}
    </section>
  )
}

/**
 * Links to the module and the module's terms, together: a group named by the terms, so
 * they are heard on the way to any link in it, and shown in it as well.
 */
function Offer({ name, className, children }: { name: string; className: string; children: ReactNode }): ReactElement {
  return (
    <div className={`product-offer ${className}`} role="group" aria-label={`${name}, not free, paid in production`}>
      {children}
    </div>
  )
}

/** When what a part says was read, since nothing here reads it again. */
function Dated(): ReactElement {
  return (
    <p className="product-dated">
      Read from the module’s repository on <time dateTime={READ_ON}>{longDate(READ_ON)}</time>.
    </p>
  )
}
