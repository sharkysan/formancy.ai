import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { ProductOgCard } from './product-og-card.js'
import { ProductPage } from './product-page.js'
import { PRODUCTS } from './products/all.js'
import { HL7_MARK, TERMS } from './products/product.js'

/**
 * A paid module's share card (0242), the image a chat app or a search result shows for its
 * product page, and the things it has to get right: it says what the page says, it says the
 * module is paid, and it shows that module's work and no other's. As `og-card.test.tsx` holds
 * the site's own, and for the reason that file gives: a card is read alone, cached by every
 * app that has seen it, and the one before the site's outlived two rewrites of the headline.
 */
afterEach(cleanup)

/** The words, joined by single spaces: the card and the page may break a line differently. */
const words = (element: HTMLElement): string => (element.textContent ?? '').replace(/\s+/g, ' ').trim()

describe.each(Object.values(PRODUCTS))('$name’s share card', (product) => {
  test('says the promise its page’s heading makes', () => {
    // Compared with the page as drawn, not with the `Product` both read: a card that typed
    // its own headline, or drew another field of the module's, fails here when the page's
    // heading changes and the card's does not.
    render(<ProductOgCard product={product} />)
    const card = words(screen.getByRole('heading', { level: 1 }))
    cleanup()

    render(<ProductPage product={product} />)
    const page = words(screen.getByRole('heading', { level: 1 }))

    expect(card.length, 'the card has no headline at all').toBeGreaterThan(10)
    expect(card).toBe(page)
  })

  test('names the module with its terms beside it, since a shared card is read alone', () => {
    // A module's name beside formancy's mark, with nothing saying it is paid, reads as part
    // of the free thing (0179): the card is the one place of all the site's where nothing else
    // on the page can say it.
    const { container } = render(<ProductOgCard product={product} />)

    const text = container.textContent ?? ''
    expect(text).toContain(product.name)
    expect(text).toContain(TERMS)
    expect(text).toMatch(/source-available/i)
    expect(text).not.toMatch(/(?<!not )open[\s-]source/i)
  })

  test('shows its own module’s example, and HL7’s sentence where it names HL7’s marks', () => {
    // The sketches are one component per module, picked by the page's id: a card for Report
    // drawing Data's orders would say the wrong thing about both. And a card whose promise
    // names HL7 or FHIR owes HL7's sentence, as the page that promise is on does.
    const { container } = render(<ProductOgCard product={product} />)

    const figures = container.querySelectorAll('figure.mx')
    expect(figures).toHaveLength(1)
    expect(figures[0]?.classList.contains(`mx-${product.page}`), String(figures[0]?.className)).toBe(true)
    expect(figures[0]?.querySelectorAll('a, button, input, select, textarea, [tabindex]')).toHaveLength(0)

    const said = container.textContent ?? ''
    if (/\b(HL7|FHIR)\b/.test(said)) expect(said).toContain(HL7_MARK)
    else expect(said).not.toContain(HL7_MARK)
  })

  test('is drawn at the size Open Graph asks for, under the id it is screenshotted by', () => {
    // `.og-card` declares 1200×630, the size each page's head says its image is; read off
    // the element, since jsdom has no layout. `#og-card` is what `docs/images/README.md` says
    // to screenshot, and there is one on the page.
    const { container } = render(<ProductOgCard product={product} />)

    const root = container.firstElementChild
    expect(root?.id).toBe('og-card')
    expect(root?.classList.contains('og-card')).toBe(true)
    expect(within(container).getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})
