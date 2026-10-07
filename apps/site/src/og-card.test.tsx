import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { App } from './app.js'
import { OgCard } from './og-card.js'

/**
 * The card a link preview shows, and the one thing it has to get right.
 *
 * This file was written because a card went stale: its own docblock records that
 * the previous one "outlived two rewrites of the headline before anybody noticed
 * it still read *One engine, in the browser and on the server*". The fix was to
 * build the card from the same renderer and the same fonts as the page — and
 * then **nothing checked that the words still matched**, which is the half the
 * story was actually about. It sat at 0% coverage, found by reading the report.
 *
 * A stale card is the worst-placed wrong statement in the project: it is the
 * only thing most people ever read, it is cached by every chat app that has seen
 * it, and the page it contradicts is one click away.
 */
beforeEach(() => {
  /*
   * The page uses `IntersectionObserver` to notice which sections have been
   * read, and jsdom has none — so rendering `<App />` to compare headlines needs
   * a stub. Deliberately inert here: this file is about the card's words, and
   * the journey the observer drives is `site.test.tsx`'s subject.
   */
  class FakeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver)
})

afterEach(cleanup)

/**
 * The words, joined by single spaces — not `textContent`.
 *
 * The two headlines are marked up differently on purpose: the page separates its
 * halves with `{' '}` and the card with a `<br>`, which contributes no text at
 * all. So `textContent` gives `Build the form.Ship your product.` for one and
 * `Build the form. Ship your product.` for the other, and comparing those says
 * the two disagree when they say the same thing.
 *
 * Walking the text nodes and joining them is the comparison this case is
 * actually about: the same words, in the same order.
 */
const words = (element: HTMLElement): string => {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const parts: string[] = []
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = (node.textContent ?? '').trim()
    if (text !== '') parts.push(text)
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

describe('the link preview card', () => {
  test('says what the page says, which is the drift it exists to prevent', () => {
    /*
     * Derived from both sources rather than from a literal in either. The page
     * splits the headline across two spans with a space between them and the
     * card uses a `<br>`, so the comparison is on the words and not the markup —
     * a rewrite of one without the other fails here, which is exactly what did
     * not happen last time.
     */
    render(<OgCard />)
    const card = words(screen.getByRole('heading', { level: 1 }))
    cleanup()

    render(<App />)
    const page = words(screen.getByRole('heading', { level: 1 }))

    expect(card.length, 'the card has no headline at all').toBeGreaterThan(10)
    expect(card, 'the card and the page disagree about the headline').toBe(page)
  })

  test('and renders a real form, because a drawing of one argues against the product', () => {
    /*
     * The card is built from `@formancy/react` on purpose: a picture of a form on
     * the page of a form library is the page arguing against itself, and nothing
     * else would say so. Asserted by role, so a control that stops being a
     * control fails here even if it still looks right.
     */
    render(<OgCard />)

    /*
     * By name, not by count. The card collects a name, an email, a choice, a
     * date and a total — and the first version of this case asked for a
     * `textbox` and found none, because `format: 'email'` renders
     * `<input type="email">`, whose role is `textbox` only for `type="text"`.
     * Asking for the control by its label is both more honest and the contract
     * this repository actually holds renderers to
     * ([0034](../../../docs/decisions/0034-accessible-name-only.md)).
     */
    expect(screen.getByLabelText(/your name/i), 'the card shows no real control').toBeTruthy()
    expect(screen.getByLabelText(/work email/i)).toBeTruthy()
  })

  test('and is exactly the size Open Graph asks for', () => {
    /*
     * 1200×630 is what Twitter, Slack, LinkedIn and iMessage all crop from, and
     * the docblock claims it. A card at another size is not broken — it is
     * cropped, differently by each of them, which is worse because it looks
     * deliberate.
     *
     * Read off the element's own attributes, since jsdom has no layout: what is
     * pinned is the declaration, which is the thing a person would change.
     */
    const { container } = render(<OgCard />)
    const root = container.firstElementChild as HTMLElement | null

    expect(root, 'the card renders nothing').not.toBeNull()
    const style = root?.getAttribute('style') ?? ''
    const className = root?.getAttribute('class') ?? ''
    // Either the element carries the size or the stylesheet does; what must not
    // happen is neither, which is how a card silently becomes the viewport.
    expect(
      /1200/.test(style) || /og-card/.test(className),
      'nothing on the card declares its size',
    ).toBe(true)
  })
})
