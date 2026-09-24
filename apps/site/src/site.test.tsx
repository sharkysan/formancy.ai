import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { App } from './app.js'
import { JOURNEY, isComplete, submissionFor } from './scroll.js'

/**
 * The landing page.
 *
 * Two things are worth pinning here and the rest is styling. First, the form
 * halfway down is real — if it ever becomes a screenshot, the page is arguing
 * against its own product and nothing else will say so. Second, the page is a
 * document: one heading level one, a skip link, headings in order, and every
 * control reachable by name. A form engine that ships an inaccessible page
 * about accessibility has a credibility problem, not a styling one.
 */
beforeEach(() => {
  // jsdom has no IntersectionObserver, and the page uses it to notice which
  // sections have been read. Recorded rather than stubbed away, so a test can
  // drive the journey the way scrolling would.
  observed = []
  // Not `implements IntersectionObserver`: the DOM interface grows properties
  // (`scrollMargin` most recently) that a stub has no business carrying, and
  // the repo forbids parameter properties, so the constructor is plain too.
  class FakeObserver {
    constructor(onChange: IntersectionObserverCallback) {
      callbacks.push(onChange)
    }
    observe(target: Element): void {
      observed.push(target)
    }
    unobserve(): void {}
    disconnect(): void {}
  }
  callbacks = []
  vi.stubGlobal('IntersectionObserver', FakeObserver)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

let observed: Element[] = []
let callbacks: IntersectionObserverCallback[] = []

/** Report sections as read, the way scrolling past them would. */
const read = (...sections: string[]): void => {
  const entries = observed
    .filter((target) => sections.includes(target.getAttribute('data-section') ?? ''))
    .map((target) => ({ target, isIntersecting: true }) as unknown as IntersectionObserverEntry)
  // Inside `act`, because the real observer fires outside React's knowledge
  // and the state it sets has to be flushed before anything is asserted.
  act(() => {
    for (const callback of callbacks) {
      callback(entries, undefined as unknown as IntersectionObserver)
    }
  })
}

describe('the page is a document first', () => {
  test('one heading level one, and it is the argument', () => {
    render(<App />)

    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toContain('browser and on the server')
  })

  test('a skip link, for a page this long', () => {
    render(<App />)

    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe(
      '#start',
    )
  })

  test('every section heading is a level two, so the outline does not skip', () => {
    render(<App />)

    // A landing page that jumps h1 to h3 for visual weight is a landing page
    // somebody navigating by heading cannot use.
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(4)
  })

  test('the source is reachable from the top and the bottom', () => {
    render(<App />)

    const links = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))
      .filter((href) => href === 'https://github.com/sharkysan/formancy.ai')

    expect(links.length).toBeGreaterThan(1)
    expect(links[0]).toBe('https://github.com/sharkysan/formancy.ai')
  })
})

describe('the demo is the product, not a picture of it', () => {
  test('it renders real labelled controls from the document', () => {
    render(<App />)

    expect(screen.getByLabelText('Company')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Plan' })).toBeTruthy()
  })

  test('a field appears because the document says it should', async () => {
    const user = userEvent.setup()
    render(<App />)

    // The claim the section makes, checked rather than asserted in prose.
    expect(screen.queryByLabelText('Region')).toBeNull()

    await user.click(screen.getByRole('radio', { name: 'Managed cloud' }))

    expect(await screen.findByLabelText('Region')).toBeTruthy()
  })

  test('a computed field is computed, not typed into', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Seats'), '25')

    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('Estimated monthly (CHF)').value).toBe('100'),
    )
  })
})

describe('the running submission', () => {
  test('is absent until something has been read', () => {
    render(<App />)

    expect(screen.queryByRole('complementary')).toBeNull()
  })

  test('fills in as sections are read, in the journey’s order', () => {
    render(<App />)

    read('hero', 'engine')

    const panel = screen.getByRole('complementary', {
      name: 'What you have told us by reading this far',
    })
    expect(within(panel).getByText(/"interested": true/)).toBeTruthy()
    expect(within(panel).getByText(/"runsIn"/)).toBeTruthy()
  })

  test('an answer does not un-answer itself when it scrolls out of view', () => {
    render(<App />)

    read('hero')
    read('engine')

    // The panel is a submission being filled in. Scrolling past a section is
    // not withdrawing what it said.
    const panel = screen.getByRole('complementary')
    expect(within(panel).getByText(/"interested": true/)).toBeTruthy()
  })

  test('says it is ready once every section has been read', () => {
    render(<App />)

    read(...JOURNEY.map((stop) => stop.section))

    expect(screen.getByText('ready to send')).toBeTruthy()
  })
})

describe('the ending', () => {
  test('stamps the receipt once the last section is actually reached', async () => {
    render(<App />)

    read(...JOURNEY.map((stop) => stop.section))
    expect(screen.getByText('201 Created').className).not.toContain('landed')

    read('finale')

    // A beat, so the receipt is read before the stamp lands on it.
    await waitFor(() => expect(screen.getByText('201 Created').className).toContain('landed'))
  })

  test('is announced, not only shown', async () => {
    render(<App />)

    read(...JOURNEY.map((stop) => stop.section), 'finale')

    // Somebody who cannot see the stamp land should still be told the page did
    // the thing it spent seven sections building to.
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('validated by the same engine'),
    )
  })
})

describe('submissionFor', () => {
  test('answers only what has been read', () => {
    expect(submissionFor(new Set(['hero']))).toEqual({ interested: true })
    expect(submissionFor(new Set())).toEqual({})
  })

  test('is in the journey’s order, not the order sections were seen', () => {
    // Two visitors who read the same page produce the same submission, which
    // is the property that makes the ending honest rather than a trick.
    const forwards = submissionFor(new Set(['hero', 'engine']))
    const backwards = submissionFor(new Set(['engine', 'hero']))

    expect(Object.keys(forwards)).toEqual(Object.keys(backwards))
  })

  test('is complete only when every section has been read', () => {
    expect(isComplete(new Set(['hero']))).toBe(false)
    expect(isComplete(new Set(JOURNEY.map((stop) => stop.section)))).toBe(true)
  })
})
