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
    // Scoped: the file field keeps its own status region for upload progress,
    // so the page has more than one and an unscoped query is a trap waiting
    // for whoever opens that tab in a test.
    const finale = document.querySelector('#finale') as HTMLElement
    await waitFor(() =>
      expect(within(finale).getByRole('status').textContent).toContain(
        'validated by the same engine',
      ),
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

describe('the types spec 2 added', () => {
  /** Open the demo's second tab, where the new types live. */
  const openDetail = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
    await user.click(screen.getByRole('tab', { name: 'Detail' }))
  }

  test('the demo is arranged in tabs, and the strip is named', () => {
    render(<App />)

    // Named because a form may have two strips, and "tab list" twice tells a
    // screen-reader user which one they are in exactly as well as nothing.
    const strip = screen.getByRole('tablist', { name: 'Quote' })
    expect(within(strip).getAllByRole('tab')).toHaveLength(2)
  })

  test('a selectboxes answer is a list of ticks', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openDetail(user)

    const group = screen.getByRole('group', { name: 'What the quote should cover' })
    await user.click(within(group).getByRole('checkbox', { name: 'An accessibility audit' }))

    expect(
      within(group).getByRole<HTMLInputElement>('checkbox', { name: 'An accessibility audit' })
        .checked,
    ).toBe(true)
  })

  test('a rule reads that list, and a field appears because of what is in it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openDetail(user)

    expect(screen.queryByLabelText('The forms you are migrating')).toBeNull()

    await user.click(screen.getByRole('checkbox', { name: 'Migrating forms we already have' }))

    // `'migration' in topics` — the same expression the server would replay.
    expect(await screen.findByLabelText('The forms you are migrating')).toBeTruthy()
  })

  test('rich text is parsed into elements, never handed to innerHTML', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openDetail(user)

    await user.type(screen.getByLabelText('Anything else we should know'), '**urgent**')

    // The preview is the proof: what was typed came back as a `strong`
    // element, which means it went through the parser rather than through a
    // sanitiser somebody has to keep correct forever.
    const preview = document.querySelector('[data-formancy-part="richtext"]')
    await waitFor(() => expect(preview?.querySelector('strong')?.textContent).toBe('urgent'))
  })

  test('the file field accepts a file, and the page does not pretend it went anywhere', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openDetail(user)
    await user.click(screen.getByRole('checkbox', { name: 'Migrating forms we already have' }))

    const input = await screen.findByLabelText<HTMLInputElement>('The forms you are migrating')
    await user.upload(input, new File(['%PDF'], 'intake.pdf', { type: 'application/pdf' }))

    expect(await screen.findByText('intake.pdf')).toBeTruthy()
    // Said in the copy as well as in the storage key. A demo that looks like
    // it stored something is a demo that makes the product look like it
    // silently drops files.
    expect(screen.getByText(/stays in this tab/)).toBeTruthy()
  })
})

describe('the way out to the playground', () => {
  test('is in the bar and at the end', () => {
    render(<App />)

    const links = screen.getAllByRole('link', { name: /playground/i })
    expect(links.length).toBeGreaterThan(1)
  })

  test('is absolute in development, because the two apps are two servers then', () => {
    render(<App />)

    // A relative path would land on whichever app is being worked on. Broken
    // for everybody developing the site is broken nobody notices in
    // production either.
    for (const link of screen.getAllByRole('link', { name: /playground/i })) {
      expect(link.getAttribute('href')).toBe('http://localhost:4381/')
    }
  })
})

describe('the stack', () => {
  test('is a list of packages, not a picture of one', () => {
    render(<App />)

    // The 3D is a second reading. The first one has to be the content: a
    // reader with no scroll timelines, no 3D or motion turned off still gets
    // the packages in build order, which is what the section is for.
    const list = screen.getByRole('list', { name: '' , hidden: false })
    expect(list.tagName).toBe('OL')
    const items = within(list).getAllByRole('listitem')
    expect(items.map((item) => item.querySelector('b')?.textContent)).toEqual([
      '@formancy/spec',
      '@formancy/expressions',
      '@formancy/core',
      '@formancy/react · @formancy/angular',
      '@formancy/ui-react · ui-angular',
      'your design system',
    ])
  })

  test('says which layers are shared and which are written twice, in words', () => {
    render(<App />)

    // 1.4.1: the edge-light on each plane carries this visually, so something
    // that is not colour has to carry it too.
    const shared = document.querySelectorAll('[data-plane="shared"]')
    const split = document.querySelectorAll('[data-plane="split"]')
    expect(shared).toHaveLength(3)
    expect(split).toHaveLength(2)
  })

  test('answers a field in the running submission, like every other section', () => {
    render(<App />)

    read('stack')

    expect(within(screen.getByRole('complementary')).getByText(/"layers"/)).toBeTruthy()
  })
})

describe('the mark', () => {
  test('is decoration beside a wordmark that already says the name', () => {
    render(<App />)

    const mark = document.querySelector('.mark')
    // Announced, it would read the name twice. It is the favicon, drawn
    // inline so it takes the page's accents rather than repeating them.
    expect(mark?.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getAllByText('formancy.ai').length).toBeGreaterThan(0)
  })
})
