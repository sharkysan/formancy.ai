import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import axe from 'axe-core'

import {
  ACCESSIBILITY_EXCLUSIONS,
  ACCESSIBILITY_TAGS,
  ACCESSIBILITY_UNMEASURABLE_IN_JSDOM,
} from '@formancy/conformance'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'

import { FormancyForm, FormancyProvider } from './index.js'

afterEach(cleanup)

const CLOCK = { now: () => 0, today: () => '2026-09-27', random: () => 0.5 }

/**
 * `widget: "typeahead"` — a select you type into.
 *
 * ── WHY NO FIXTURE CHANGES ───────────────────────────────────────────────────
 *
 * Measured rather than assumed, in the `aria-query` this repository already
 * installs (5.3.2): `comboboxRole.relatedConcepts` lists `select` with *the
 * multiple attribute not set and the size attribute not greater than 1*, and
 * `elementRoles` maps exactly that element to `combobox`. So a plain `<select>`
 * and an `<input role="combobox">` answer to the SAME role, and a fixture
 * querying by role and accessible name finds either one
 * ([0034](../../../docs/decisions/0034-accessible-name-only.md)). The first case
 * below asserts it, because the claim "conformance is untouched" is worth more
 * than a sentence.
 *
 * ── THE ARIA DECISIONS ───────────────────────────────────────────────────────
 *
 * An ARIA 1.2 editable combobox over a listbox popup: the text box keeps DOM
 * focus at all times and the arrowed-over option is named by
 * `aria-activedescendant`, so nothing ever moves focus into the list.
 *
 * `aria-expanded` and `aria-controls` are REQUIRED properties of the role, which
 * is why the listbox element exists while the popup is collapsed: an
 * `aria-controls` pointing at nothing is an unresolvable IDREF, and axe reports
 * both absences.
 *
 * `aria-autocomplete="list"` and not `"both"`: nothing is ever written into the
 * text box on the person's behalf, and `"both"` promises an inline completion
 * that is not there. No `aria-haspopup` — `listbox` is already the role's
 * implicit popup, so the attribute adds nothing and a wrong value would lie.
 *
 * `aria-selected` marks the CHOSEN option. The arrowed-over one is named by
 * `aria-activedescendant` and is not selected: they are two different facts, and
 * a control that conflated them would tell a screen reader the answer had
 * changed every time somebody pressed Down to look.
 *
 * ── AND WHAT IT MAY NOT DO ───────────────────────────────────────────────────
 *
 * A widget may change how a field LOOKS and never what it COLLECTS
 * ([0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md)).
 * The only calls to `setValue` in the control pass an OPTION'S OWN VALUE or
 * `null`; the typed text reaches nothing but the filter. So the question "what
 * happens on blur when the query matches nothing" has one structurally available
 * answer — nothing is stored — and the cases below pin it.
 *
 * Deliberately a near-copy of the Angular file rather than a shared helper: a
 * renderer's markup is exactly the thing that must not be shared, and a shared
 * abstraction would report that both renderers implemented this when one had not.
 */

const OPTIONS = [
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
  { value: 'it', label: 'Italiano' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'q7', label: 'Schwiizerdütsch' },
]

function schemaWith(widget?: 'typeahead'): FormSchema {
  return {
    specVersion: '2',
    id: 'languages',
    title: 'Languages',
    model: {
      fields: [
        {
          key: 'language',
          type: 'select',
          label: 'Card language',
          options: OPTIONS,
          ...(widget === undefined ? {} : { widget }),
        },
      ],
    },
  } as FormSchema
}

function mount(widget?: 'typeahead'): FormEngine {
  const engine = createFormEngine({ schema: schemaWith(widget), capabilities: CLOCK })
  render(
    <FormancyProvider engine={engine}>
      <FormancyForm />
    </FormancyProvider>,
  )
  return engine
}

const combobox = (): HTMLInputElement =>
  screen.getByRole('combobox', { name: 'Card language' }) as HTMLInputElement

const type = (text: string): void => {
  fireEvent.change(combobox(), { target: { value: text } })
}

const press = (key: string): void => {
  fireEvent.keyDown(combobox(), { key })
}

const optionLabels = (): string[] =>
  screen.getAllByRole('option').map((option) => option.textContent ?? '')

/** The option the text box currently names, read the way a screen reader does. */
const activeOptionLabel = (): string | null => {
  const id = combobox().getAttribute('aria-activedescendant')
  if (id === null) return null
  return document.getElementById(id)?.textContent ?? null
}

describe('the plain select the typeahead has to stay compatible with', () => {
  test('is already a combobox, so no conformance fixture changes', () => {
    // The whole reason this widget costs conformance nothing. If a browser or
    // aria-query ever stopped mapping a single select to `combobox`, every
    // fixture holding a select would change behaviour and this says so first.
    mount()
    const control = screen.getByRole('combobox', { name: 'Card language' })
    expect(control.tagName).toBe('SELECT')
  })

  test('without the widget the control is still that select', () => {
    // A guard on the guard: a renderer that rendered the typeahead for every
    // select would satisfy every case below while ignoring the widget.
    mount()
    expect(combobox().tagName).toBe('SELECT')
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

describe('a select with the typeahead widget', () => {
  test('is a combobox with the same accessible name, and an editable text box', () => {
    // The failure this prevents: a control built from divs, or one whose name
    // lives somewhere a screen reader does not look — either of which is a field
    // conformance cannot find at all.
    mount('typeahead')
    const control = combobox()
    expect(control.tagName).toBe('INPUT')
    expect(control.getAttribute('type')).toBe('text')
    expect(control.getAttribute('data-formancy-part')).toBe('typeahead')
  })

  test('carries the attributes the role requires while it is collapsed', () => {
    // The failure this prevents: axe's aria-required-attr on a combobox with no
    // aria-expanded, and an aria-controls whose IDREF resolves to nothing —
    // which is what happens when the popup element is only rendered once open.
    mount('typeahead')
    const control = combobox()
    expect(control.getAttribute('aria-expanded')).toBe('false')
    const controls = control.getAttribute('aria-controls')
    expect(controls).not.toBeNull()
    expect(document.getElementById(controls!)).not.toBeNull()
    expect(control.getAttribute('aria-autocomplete')).toBe('list')
    // Nothing is active yet, so the attribute is ABSENT rather than empty: an
    // empty IDREF is a broken reference, not a way of saying "nothing".
    expect(control.hasAttribute('aria-activedescendant')).toBe(false)
    // `listbox` is the role's implicit popup. Saying it again adds nothing, and
    // the wrong value would describe a popup that is not there.
    expect(control.hasAttribute('aria-haspopup')).toBe(false)
  })

  test('names its popup, which the auditor does not check', () => {
    // `listbox` is a role whose accessible name is required -- aria-query's
    // `listboxRole.accessibleNameRequired` is true -- and axe in jsdom reports
    // nothing when it is missing, measured by deleting the attribute and watching
    // the audit below stay green. So this case is what holds the name in place.
    //
    // A DIFFERENT name from the field's, deliberately: two elements answering to
    // "Card language" would make every query by that name ambiguous, including
    // the conformance driver's.
    mount('typeahead')
    press('ArrowDown')
    expect(screen.getByRole('listbox', { name: 'Card language suggestions' })).toBeDefined()
    expect(screen.queryAllByLabelText('Card language')).toHaveLength(1)
  })

  test('opens on ArrowDown with every option, in the document order', () => {
    // The failure this prevents: a list a keyboard cannot open, which is the
    // whole control unreachable without a pointer (WCAG 2.1.1).
    mount('typeahead')
    press('ArrowDown')
    expect(optionLabels()).toEqual([
      'Deutsch',
      'Français',
      'Italiano',
      'Türkçe',
      'Schwiizerdütsch',
    ])
  })

  test('narrows as somebody types, folded, and keeps the document order', () => {
    // The failure this prevents: `Türkçe` unreachable from a keyboard without an
    // umlaut, and — the subtler one — a list that re-ranks while somebody types,
    // moving the row they were reaching for.
    mount('typeahead')
    type('turkce')
    expect(optionLabels()).toEqual(['Türkçe'])
    type('tsch')
    expect(optionLabels()).toEqual(['Deutsch', 'Schwiizerdütsch'])
  })

  test('filters on the label and never on the value', () => {
    // The value is not on the screen. Matching it would keep a row in the list
    // for a reason the person cannot see, and drop rows for the same reason.
    mount('typeahead')
    type('q7')
    expect(screen.queryAllByRole('option')).toEqual([])
  })

  test('typing stores nothing at all', () => {
    // THE line the widget mechanism exists to hold. A control that stored what
    // was typed would collect text a plain select could never produce, and no
    // reader of the submission could tell it was not an option value.
    const engine = mount('typeahead')
    type('fra')
    expect(engine.value()).toEqual({})
  })

  test('Down and Up name the active option and stop at the ends', () => {
    // The failure this prevents: an active option nothing announces, because
    // DOM focus never leaves the text box — aria-activedescendant is the only
    // thing that says where the person is.
    mount('typeahead')
    press('ArrowDown')
    expect(activeOptionLabel()).toBe('Deutsch')
    press('ArrowDown')
    expect(activeOptionLabel()).toBe('Français')
    press('ArrowUp')
    expect(activeOptionLabel()).toBe('Deutsch')
    // Clamped rather than wrapped: Down means further down the list. Wrapping
    // silently moves somebody past the end of what they were reading.
    press('ArrowUp')
    expect(activeOptionLabel()).toBe('Deutsch')
  })

  test('Home and End go to the first and last option that matched', () => {
    // The failure this prevents: Home and End moving the caret inside the text
    // box while a popup is open, which leaves a long list reachable only by
    // holding Down.
    mount('typeahead')
    press('ArrowDown')
    press('End')
    expect(activeOptionLabel()).toBe('Schwiizerdütsch')
    press('Home')
    expect(activeOptionLabel()).toBe('Deutsch')
    // Against the narrowed list, not the whole one: End is the end of what is
    // on the screen.
    type('tsch')
    press('End')
    expect(activeOptionLabel()).toBe('Schwiizerdütsch')
  })

  test('Enter chooses the active option and stores that option value', () => {
    // The failure this prevents: a keyboard route that can look but not choose.
    const engine = mount('typeahead')
    type('fra')
    press('ArrowDown')
    press('Enter')
    expect(engine.value()).toEqual({ language: 'fr' })
    // The list is put away and the box shows the answer rather than the query.
    expect(combobox().value).toBe('Français')
    expect(combobox().getAttribute('aria-expanded')).toBe('false')
  })

  test('a pointer opens the list and chooses a row', () => {
    // The mouse route, which none of the keyboard cases touch: clicking the box
    // opens the list, and clicking a row is the same choice Enter makes. The
    // mousedown is default-prevented so DOM focus stays in the text box — without
    // that the blur handler runs first and the click lands on a list that has gone.
    const engine = mount('typeahead')
    fireEvent.click(combobox())
    expect(optionLabels()).toHaveLength(5)

    const italiano = screen.getByRole('option', { name: 'Italiano' })
    expect(fireEvent.mouseDown(italiano)).toBe(false)
    fireEvent.click(italiano)

    expect(engine.value()).toEqual({ language: 'it' })
    expect(combobox().value).toBe('Italiano')
  })

  test('leaves Enter and Escape alone when no list is showing', () => {
    // Enter belongs to the FORM: a control that swallowed it would break
    // submitting from the keyboard. Escape with nothing open and nothing typed has
    // nothing to abandon, and taking it would swallow the key a dialog or drawer
    // around the form is listening for.
    mount('typeahead')
    expect(fireEvent.keyDown(combobox(), { key: 'Enter' })).toBe(true)
    expect(fireEvent.keyDown(combobox(), { key: 'Escape' })).toBe(true)
  })

  test('Enter with nothing arrowed to puts the list away and stores nothing', () => {
    // A path the coverage report found unreached, and a real one: somebody types,
    // reads the narrowed list, and presses Enter without arrowing to a row. It must
    // not choose the first match on their behalf -- that is an answer nobody gave --
    // and it must not submit the form either, which is what Enter would do if the
    // control let it through while a popup was on the screen.
    const engine = mount('typeahead')
    type('tsch')
    expect(screen.getAllByRole('option')).toHaveLength(2)
    press('Enter')

    expect(engine.value()).toEqual({})
    expect(combobox().getAttribute('aria-expanded')).toBe('false')
  })

  test('gives the popup a containing block that wraps the control and nothing else', () => {
    // The bug this prevents, reported against the running playground: the list opened
    // OVER its own label and box instead of under them.
    //
    // The popup was absolutely positioned with `top: auto`, which takes the element's
    // STATIC position -- where it would have sat in the flow. That is true inside a block
    // container and false inside a grid one, and every theme lays a field out with
    // `display: grid`: for an absolutely positioned child of a grid container the static
    // position is the container's own content-box origin. Measured in the playground, the
    // field's top edge was 457px, an in-flow child would have sat at 537px, and the popup
    // sat at 459px.
    //
    // jsdom has no layout, so this cannot check where the popup LANDS. What it checks is
    // the structure the themes position against: an anchor that holds the box and the
    // list and nothing else. The status region stays outside it, because it is a row of
    // the field's grid exactly as the error region is. The matching half of the contract
    // -- that every theme positions that anchor and gives the popup an explicit offset --
    // is in `apps/docs/src/themes.test.ts`.
    mount('typeahead')
    const control = screen.getByRole('combobox', { name: 'Card language' })
    const anchor = control.parentElement

    expect(anchor?.getAttribute('data-formancy-part')).toBe('typeahead-anchor')
    expect(anchor?.querySelector('[data-formancy-part="typeahead-listbox"]')).not.toBeNull()

    // And nothing else in it: an anchor that also wrapped the label would put the popup
    // back where it started, under the whole field rather than under the box.
    const parts = [...(anchor?.children ?? [])].map((child) =>
      child.getAttribute('data-formancy-part'),
    )
    expect(parts).toEqual(['typeahead', 'typeahead-listbox'])

    // The status region is a sibling of the anchor, not a child of it.
    const field = control.closest('[data-formancy-part="field"]')
    expect(field?.querySelector('[data-formancy-part="typeahead-empty"]')?.parentElement).toBe(field)
  })

  test('marks the chosen option selected and the arrowed-over one only active', () => {
    // The failure this prevents, and it is the commonest defect in this pattern:
    // aria-selected following the arrow keys, so a screen reader hears the answer
    // change every time somebody presses Down to look at the next row.
    //
    // THREE presses, not two, is what makes this case discriminate, and the earlier
    // version had two. `Français` is the second of five options, so arrowing twice
    // from the top lands on the row that is also the chosen one -- the two facts
    // coincide there, and a control whose aria-selected followed the arrow keys
    // passed. Measured: inverting the binding to `activeValue` left all 24 cases
    // green. One more press separates them, and now exactly one of the two moves.
    const engine = mount('typeahead')
    type('fra')
    press('ArrowDown')
    press('Enter')
    type('')
    press('ArrowDown')
    press('ArrowDown')
    press('ArrowDown')

    const selectedLabels = (): Array<string | null> =>
      screen
        .getAllByRole('option')
        .filter((option) => option.getAttribute('aria-selected') === 'true')
        .map((option) => option.textContent)

    // Arrowed past the answer: active has moved, selected has not.
    expect(activeOptionLabel()).toBe('Italiano')
    expect(selectedLabels()).toEqual(['Français'])
    expect(engine.value()).toEqual({ language: 'fr' })

    // And back again, so the case cannot pass by selected happening to equal the
    // option two rows above active.
    press('ArrowUp')
    expect(activeOptionLabel()).toBe('Français')
    expect(selectedLabels()).toEqual(['Français'])
    press('ArrowUp')
    expect(activeOptionLabel()).toBe('Deutsch')
    expect(selectedLabels()).toEqual(['Français'])
    expect(engine.value()).toEqual({ language: 'fr' })
  })

  test('Escape puts the list away, keeps the answer and abandons the query', () => {
    // The failure this prevents: Escape clearing the answer. Escape means "never
    // mind about this list", not "delete what I chose earlier".
    const engine = mount('typeahead')
    type('fra')
    press('ArrowDown')
    press('Enter')
    type('ital')
    press('Escape')

    expect(engine.value()).toEqual({ language: 'fr' })
    expect(combobox().value).toBe('Français')
    expect(combobox().getAttribute('aria-expanded')).toBe('false')
  })

  test('Tab away with a partial query stores nothing and shows the answer again', () => {
    // The failure this prevents: half a word left in the box, or worse, stored.
    // A select cannot hold `ital`, so neither may this.
    const engine = mount('typeahead')
    type('fra')
    press('ArrowDown')
    press('Enter')
    type('ital')
    fireEvent.blur(combobox())

    expect(engine.value()).toEqual({ language: 'fr' })
    expect(combobox().value).toBe('Français')
  })

  test('leaving with a query that matches nothing stores nothing', () => {
    // The answer that must not be "store the text". Nothing was chosen, so
    // nothing is the answer — and the box goes back to showing that.
    const engine = mount('typeahead')
    type('klingon')
    fireEvent.blur(combobox())

    expect(engine.value()).toEqual({})
    expect(combobox().value).toBe('')
  })

  test('emptying the box and leaving clears the answer, as the empty option does', () => {
    // Without this the typeahead can reach a state the plain select cannot leave:
    // a select has an empty first option, so un-answering is always available,
    // and a widget may not take that away.
    const engine = mount('typeahead')
    type('fra')
    press('ArrowDown')
    press('Enter')
    type('')
    fireEvent.blur(combobox())

    expect(engine.value()).toEqual({ language: null })
    expect(combobox().value).toBe('')
  })

  test('stores exactly what the default control stores', () => {
    // The structural claim of 0065, asserted rather than trusted: same schema,
    // same choice, same submission.
    const plain = createFormEngine({ schema: schemaWith(), capabilities: CLOCK })
    render(
      <FormancyProvider engine={plain}>
        <FormancyForm />
      </FormancyProvider>,
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Card language' }), {
      target: { value: 'fr' },
    })
    cleanup()

    const widgeted = mount('typeahead')
    type('fra')
    press('ArrowDown')
    press('Enter')

    expect(JSON.stringify(widgeted.value())).toBe(JSON.stringify(plain.value()))
  })

  test('says when nothing matches, in a region that was already there', () => {
    // Two failures. One: a list that goes silently empty, which reads as a
    // broken control rather than as a query with no answers. Two: a live region
    // created at the moment it gets its text, which several screen readers do
    // not announce — so the element exists from the start and is empty.
    mount('typeahead')
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('')
    type('klingon')
    expect(screen.getByRole('status').textContent).not.toBe('')
    // And the popup is honestly collapsed, because nothing is popped up.
    expect(combobox().getAttribute('aria-expanded')).toBe('false')
    // Arrowing over a list with nothing in it names nothing, rather than pointing
    // aria-activedescendant at a row that is not there.
    press('ArrowDown')
    expect(combobox().hasAttribute('aria-activedescendant')).toBe(false)
  })

  test('follows a value set from outside the control', () => {
    // The bug this repository has now written twice: a component that reads the
    // engine's snapshot without subscribing renders once and never again. Here it
    // would look like a computed rule or a resumed draft that the box never shows.
    const engine = mount('typeahead')
    act(() => {
      engine.setValue(['language'], 'it')
    })
    expect(combobox().value).toBe('Italiano')
  })
})

/**
 * The same auditor the conformance suite runs, over the same rule set, in the three
 * states this control has.
 *
 * Here rather than only in the shared suite because no conformance fixture uses the
 * widget: the driver answers a field by writing a value into its control, and a
 * typeahead's control does not take one. So the audit that would otherwise have
 * covered this markup is run directly, on the states a fixture could not reach.
 *
 * The rule set is `@formancy/conformance`'s, for the reason that file gives: two
 * renderers audited against two rule sets are not held to the same standard.
 */
async function violationsNow(): Promise<string[]> {
  const disabled = { ...ACCESSIBILITY_EXCLUSIONS, ...ACCESSIBILITY_UNMEASURABLE_IN_JSDOM }
  const results = await axe.run(document.body, {
    runOnly: { type: 'tag', values: [...ACCESSIBILITY_TAGS] },
    rules: Object.fromEntries(Object.keys(disabled).map((id) => [id, { enabled: false }])),
    resultTypes: ['violations'],
  })
  return results.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.html ?? ''}`)
}

describe('an auditor over the three states', () => {
  test('finds nothing collapsed, open, or open with no matches', async () => {
    // The failures this prevents, reported by axe and none of them visible in a
    // render assertion: a combobox missing aria-expanded or aria-controls, an
    // aria-controls that resolves to nothing, and a listbox whose children are not
    // options. Checked by deleting `aria-controls` and watching this report
    // `aria-required-attr`. It does NOT cover the listbox's accessible name -- axe
    // in jsdom says nothing about that, which is why a case above asserts it.
    mount('typeahead')
    expect(await violationsNow()).toEqual([])

    press('ArrowDown')
    expect(await violationsNow()).toEqual([])

    type('klingon')
    expect(await violationsNow()).toEqual([])
  }, 20_000)
})
