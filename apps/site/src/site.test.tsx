import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { FIELD_TYPES } from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'
import { createFormEngine, expressionProblems } from '@formancy/core'
import { App } from './app.js'
import { EXAMPLES } from './examples.js'
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

    expect(screen.getByLabelText('Full name')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Ticket' })).toBeTruthy()
  })

  test('a field appears because the document says it should', async () => {
    const user = userEvent.setup()
    render(<App />)

    // The claim the section makes, checked rather than asserted in prose.
    expect(screen.queryByRole('group', { name: 'Pick your workshops' })).toBeNull()

    await user.click(screen.getByRole('radio', { name: 'Conference + workshops · CHF 690' }))

    expect(await screen.findByRole('group', { name: 'Pick your workshops' })).toBeTruthy()
  })

  test('a computed field is computed, not typed into', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: 'Conference + workshops · CHF 690' }))
    await user.type(screen.getByLabelText('Hotel nights · CHF 180 each'), '2')

    // 690 + 2 × 180. The rule is `… + nights * 180.0`, and the decimal
    // point is the difference between this and a total that stays empty.
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('Total (CHF)').value).toBe('1050'),
    )
  })

  test('the rules beside the form are read off the same engine', async () => {
    const user = userEvent.setup()
    render(<App />)

    const rules = screen.getByRole('list', { name: 'The rules, as the engine evaluates them' })
    const workshops = within(rules).getByText('workshops · visible').closest('li') as HTMLElement
    expect(workshops.textContent).toContain('hidden')

    await user.click(screen.getByRole('radio', { name: 'Conference + workshops · CHF 690' }))

    // Not the page's opinion of what the rule ought to say: the hook a
    // consumer would use, on the engine that drew the form.
    await waitFor(() => expect(workshops.textContent).toContain('shown'))
    expect(workshops.className).toContain('on')
  })

  test('the document beside the form is the document the form was drawn from', () => {
    render(<App />)

    // Derived, not hand-written: every rule the engine runs is in the source
    // shown next to it, so the two cannot drift apart.
    const source = document.querySelector('#build .code')?.textContent ?? ''
    for (const rule of EXAMPLES[0]?.schema.logic?.rules ?? []) {
      expect(source).toContain(JSON.stringify(rule.cel))
    }
  })
})

describe('the examples', () => {
  test('every one is a document the MCP server would accept', () => {
    // The same two checks an agent's document goes through: the spec
    // validator, and the check for an expression that compiles and then never
    // does anything. A demo form that quietly computes nothing is worse than
    // no demo.
    for (const example of EXAMPLES) {
      expect(validateSchema(example.schema)).toMatchObject({ valid: true })
      expect(expressionProblems(example.schema)).toEqual([])
    }
  })

  test('every one builds an engine', () => {
    // A third check, because the first two are not the whole story: the
    // engine refuses a visibility rule that is not certain to produce a bool,
    // and a bare checkbox (`halfBoard`) is null until somebody touches it.
    // That refusal takes the whole page down, so it is pinned here.
    const capabilities = { now: () => 0, today: () => '2027-01-01', random: () => 0 }
    for (const example of EXAMPLES) {
      expect(() => createFormEngine({ schema: example.schema, capabilities })).not.toThrow()
    }
  })

  test('are a named tab strip, and arrow keys move along it', async () => {
    const user = userEvent.setup()
    render(<App />)

    const strip = screen.getByRole('tablist', { name: 'Examples' })
    const tabs = within(strip).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(EXAMPLES.map((example) => example.title))

    // Only the selected tab is in the tab order; the arrows do the rest.
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1])
    tabs[0]?.focus()
    await user.keyboard('{ArrowRight}')

    expect(within(strip).getByRole('tab', { name: 'Bug report' }).getAttribute('aria-selected')).toBe(
      'true',
    )
    expect(document.activeElement?.textContent).toBe('Bug report')
  })

  test('switching away and back keeps what somebody typed', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Full name'), 'Ada')
    await user.click(screen.getByRole('tab', { name: 'Mountain hut' }))
    await user.click(screen.getByRole('tab', { name: 'Conference ticket' }))

    expect(screen.getByLabelText<HTMLInputElement>('Full name').value).toBe('Ada')
  })

  test('the hut prices a stay from three answers and a tick', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: 'Mountain hut' }))

    await user.type(screen.getByLabelText('Nights'), '2')
    await user.type(screen.getByLabelText('Guests'), '2')
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('Total (CHF)').value).toBe('260'),
    )

    await user.click(screen.getByRole('checkbox', { name: 'Half board · dinner and breakfast' }))

    // 2 nights × 2 guests × (65 + 48), and the kitchen question with it.
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('Total (CHF)').value).toBe('452'),
    )
    expect(screen.getByRole('group', { name: 'Anything the kitchen should know?' })).toBeTruthy()
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
  /** Open the bug report, and its second tab, where the new types live. */
  const openDetails = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
    await user.click(screen.getByRole('tab', { name: 'Bug report' }))
    await user.click(screen.getByRole('tab', { name: 'Details' }))
  }

  test('the bug report is arranged in tabs, and the strip is named', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: 'Bug report' }))

    // Named because the page has two strips, and "tab list" twice tells a
    // screen-reader user which one they are in exactly as well as nothing.
    const strip = screen.getByRole('tablist', { name: 'Bug report' })
    expect(within(strip).getAllByRole('tab')).toHaveLength(2)
  })

  test('a blocker asks how bad it is, and insists on an answer', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: 'Bug report' }))

    expect(screen.queryByLabelText(/Users affected/)).toBeNull()

    await user.click(screen.getByRole('radio', { name: 'Blocker · production is down' }))

    const affected = await screen.findByLabelText(/Users affected/)
    expect(affected.getAttribute('aria-required')).toBe('true')
  })

  test('a selectboxes answer is a list, and a rule reads it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openDetails(user)

    expect(screen.queryByLabelText('API version')).toBeNull()

    const group = screen.getByRole('group', { name: 'Where does it happen?' })
    await user.click(within(group).getByRole('checkbox', { name: 'Public API' }))

    // `'api' in platforms` — the same expression the server would replay.
    expect(await screen.findByLabelText('API version')).toBeTruthy()
  })

  test('rich text is parsed into elements, never handed to innerHTML', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openDetails(user)

    await user.type(screen.getByLabelText('Steps to reproduce'), '**urgent**')

    // The preview is the proof: what was typed came back as a `strong`
    // element, which means it went through the parser rather than through a
    // sanitiser somebody has to keep correct forever.
    const preview = document.querySelector('[data-formancy-part="richtext"]')
    await waitFor(() => expect(preview?.querySelector('strong')?.textContent).toBe('urgent'))
  })

  test('the file field accepts a file, and the page does not pretend it went anywhere', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openDetails(user)

    const input = screen.getByLabelText<HTMLInputElement>('Screenshot or recording')
    await user.upload(input, new File(['png'], 'crash.png', { type: 'image/png' }))

    expect(await screen.findByText('crash.png')).toBeTruthy()
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
    const list = screen.getByRole('list', { name: 'The packages, in build order' })
    expect(list.tagName).toBe('OL')
    const items = within(list).getAllByRole('listitem')
    expect(items.map((item) => item.querySelector('b')?.textContent)).toEqual([
      '@formancy/spec',
      '@formancy/expressions',
      '@formancy/core',
      '@formancy/react · @formancy/angular',
      '@formancy/themes',
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
    expect(split).toHaveLength(1)
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

describe('the readings', () => {
  test('are a description list, because they are data', () => {
    render(<App />)

    // Five figures, each a term and its definition. A row of divs would look
    // the same and mean nothing to anything reading the page but a browser.
    const values = document.querySelectorAll('.reading dt')
    expect(values).toHaveLength(5)
    // The first four only. The fifth counts decision records, and the test
    // below derives it from the files rather than repeating it — a second
    // literal here is a second thing to forget, which is exactly how it went
    // stale: one branch added a record, another set the number, and neither
    // touched the other's line.
    expect([...values].slice(0, 4).map((value) => value.textContent)).toEqual([
      '1',
      '0',
      '15',
      '7',
    ])
  })

  test('the zero is a claim something else already proves', () => {
    render(<App />)

    // "0 uses of eval" is the reading that earns its space, and it is only
    // worth printing because `packages/spec/src/csp.test.ts` fails if it ever
    // stops being true. A number on a landing page that nothing checks is an
    // adjective with extra steps.
    expect(screen.getByText(/uses of eval/)).toBeTruthy()
  })

  test('the field-type count matches the spec rather than a guess', () => {
    render(<App />)

    // The one figure that drifts on its own: the spec grows a type and the
    // page keeps saying fifteen.
    const shown = document.querySelectorAll('.reading dt')[2]?.textContent
    expect(shown).toBe(String(FIELD_TYPES.length))
  })

  test('the decision-record count is the number of records', () => {
    render(<App />)

    // The other figure that drifts on its own: every week adds a record.
    // Counted by the bundler rather than by `fs`: the glob is resolved
    // against this file, and a record is a numbered Markdown file.
    const records = Object.keys(import.meta.glob('../../../docs/decisions/[0-9][0-9][0-9][0-9]-*.md'))
    const shown = document.querySelectorAll('.reading dt')[4]?.textContent
    expect(shown).toBe(String(records.length))
  })
})
