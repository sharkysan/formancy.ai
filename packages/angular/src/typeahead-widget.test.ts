import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen } from '@testing-library/angular'
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
import { FormancyForm, provideFormancy } from './index'

// Testing-library's auto-cleanup hooks into a global afterEach, which vitest only
// provides with globals: true; we keep globals off, so reset explicitly.
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/**
 * `widget: "typeahead"` in Angular — the same assertions the React file makes.
 *
 * Deliberately a near-copy rather than a shared helper. Two renderers agreeing is
 * the claim this repository is built on, and the way it stops being true is one of
 * them quietly not implementing something while a shared abstraction reports that
 * both did. `@formancy/conformance` is where behaviour is specified once and run
 * against both drivers; this is a unit test of a renderer's own markup, and a
 * renderer's markup is exactly the thing that must not be shared.
 *
 * The ARIA argument is written out in the React file and is the same here: an ARIA
 * 1.2 editable combobox over a listbox popup, DOM focus never leaving the text box,
 * `aria-activedescendant` naming the arrowed-over option, `aria-autocomplete="list"`
 * rather than `"both"`, no `aria-haspopup`, `aria-selected` on the chosen option
 * only, and the listbox element present while collapsed so `aria-controls` resolves.
 *
 * The filter is `narrowOptionsByLabel` from `@formancy/spec`, the same function React
 * calls, so a query cannot agree in one renderer and disagree in the other.
 *
 * And the line the mechanism exists to hold: a widget may change how a field looks
 * and never what it collects
 * ([0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md)).
 * `setValue` is reached from two places, with an option's own value or with `null`.
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

let settle: () => Promise<void> = async () => undefined

async function mount(widget?: 'typeahead'): Promise<FormEngine> {
  const engine = createFormEngine({
    schema: schemaWith(widget),
    capabilities: { now: () => 0, today: () => '2026-09-27', random: () => 0.5 },
  })
  const view = await render(FormancyForm, {
    providers: [provideZonelessChangeDetection(), provideFormancy(engine)],
  })
  settle = async () => {
    await view.fixture.whenStable()
  }
  await settle()
  return engine
}

const combobox = (): HTMLInputElement =>
  screen.getByRole('combobox', { name: 'Card language' }) as HTMLInputElement

const type = async (text: string): Promise<void> => {
  fireEvent.input(combobox(), { target: { value: text } })
  await settle()
}

const press = async (key: string): Promise<void> => {
  fireEvent.keyDown(combobox(), { key })
  await settle()
}

const blur = async (): Promise<void> => {
  fireEvent.blur(combobox())
  await settle()
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
  test('is already a combobox, so no conformance fixture changes', async () => {
    // Measured in the installed aria-query (5.3.2): a `select` with no `multiple`
    // and no `size` maps to `combobox`. So a fixture querying by role and
    // accessible name finds the plain control and the widgeted one alike.
    await mount()
    expect(screen.getByRole('combobox', { name: 'Card language' }).tagName).toBe('SELECT')
  })

  test('without the widget the control is still that select', async () => {
    // A guard on the guard: a renderer that rendered the typeahead for every
    // select would satisfy every case below while ignoring the widget.
    await mount()
    expect(combobox().tagName).toBe('SELECT')
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

describe('a select with the typeahead widget', () => {
  test('is a combobox with the same accessible name, and an editable text box', async () => {
    // The failure this prevents: a control built from divs, or one whose name
    // lives somewhere a screen reader does not look — a field conformance cannot
    // find at all.
    await mount('typeahead')
    const control = combobox()
    expect(control.tagName).toBe('INPUT')
    expect(control.getAttribute('type')).toBe('text')
    expect(control.getAttribute('data-formancy-part')).toBe('typeahead')
  })

  test('carries the attributes the role requires while it is collapsed', async () => {
    // The failure this prevents: axe's aria-required-attr on a combobox with no
    // aria-expanded, and an aria-controls whose IDREF resolves to nothing —
    // which is what happens when the popup is only rendered once open.
    await mount('typeahead')
    const control = combobox()
    expect(control.getAttribute('aria-expanded')).toBe('false')
    const controls = control.getAttribute('aria-controls')
    expect(controls).not.toBeNull()
    expect(document.getElementById(controls!)).not.toBeNull()
    expect(control.getAttribute('aria-autocomplete')).toBe('list')
    // Nothing is active yet, so the attribute is ABSENT rather than empty: an
    // empty IDREF is a broken reference, not a way of saying "nothing".
    expect(control.hasAttribute('aria-activedescendant')).toBe(false)
    // `listbox` is the role's implicit popup. Saying it again adds nothing, and a
    // wrong value would describe a popup that is not there.
    expect(control.hasAttribute('aria-haspopup')).toBe(false)
  })

  test('names its popup, which the auditor does not check', async () => {
    // `listbox` is a role whose accessible name is required — aria-query's
    // `listboxRole.accessibleNameRequired` is true — and axe in jsdom reports
    // nothing when it is missing, measured by deleting the attribute and watching
    // the audit below stay green. So this case is what holds the name in place.
    //
    // A DIFFERENT name from the field's, deliberately: two elements answering to
    // "Card language" would make every query by that name ambiguous, including
    // the conformance driver's.
    await mount('typeahead')
    await press('ArrowDown')
    expect(screen.getByRole('listbox', { name: 'Card language suggestions' })).toBeDefined()
    expect(screen.queryAllByLabelText('Card language')).toHaveLength(1)
  })

  test('opens on ArrowDown with every option, in the document order', async () => {
    // The failure this prevents: a list a keyboard cannot open, which is the
    // whole control unreachable without a pointer (WCAG 2.1.1).
    await mount('typeahead')
    await press('ArrowDown')
    expect(optionLabels()).toEqual([
      'Deutsch',
      'Français',
      'Italiano',
      'Türkçe',
      'Schwiizerdütsch',
    ])
  })

  test('narrows as somebody types, folded, and keeps the document order', async () => {
    // The failure this prevents: `Türkçe` unreachable from a keyboard without an
    // umlaut, and — the subtler one — a list that re-ranks while somebody types,
    // moving the row they were reaching for.
    await mount('typeahead')
    await type('turkce')
    expect(optionLabels()).toEqual(['Türkçe'])
    await type('tsch')
    expect(optionLabels()).toEqual(['Deutsch', 'Schwiizerdütsch'])
  })

  test('filters on the label and never on the value', async () => {
    // The value is not on the screen. Matching it would keep a row in the list
    // for a reason the person cannot see, and drop rows for the same reason.
    await mount('typeahead')
    await type('q7')
    expect(screen.queryAllByRole('option')).toEqual([])
  })

  test('typing stores nothing at all', async () => {
    // THE line the widget mechanism exists to hold. A control that stored what
    // was typed would collect text a plain select could never produce, and no
    // reader of the submission could tell it was not an option value.
    const engine = await mount('typeahead')
    await type('fra')
    expect(engine.value()).toEqual({})
  })

  test('Down and Up name the active option and stop at the ends', async () => {
    // The failure this prevents: an active option nothing announces, because DOM
    // focus never leaves the text box — aria-activedescendant is the only thing
    // that says where the person is.
    await mount('typeahead')
    await press('ArrowDown')
    expect(activeOptionLabel()).toBe('Deutsch')
    await press('ArrowDown')
    expect(activeOptionLabel()).toBe('Français')
    await press('ArrowUp')
    expect(activeOptionLabel()).toBe('Deutsch')
    // Clamped rather than wrapped: Down means further down the list. Wrapping
    // silently moves somebody past the end of what they were reading.
    await press('ArrowUp')
    expect(activeOptionLabel()).toBe('Deutsch')
  })

  test('Home and End go to the first and last option that matched', async () => {
    // The failure this prevents: Home and End moving the caret inside the text
    // box while a popup is open, which leaves a long list reachable only by
    // holding Down.
    await mount('typeahead')
    await press('ArrowDown')
    await press('End')
    expect(activeOptionLabel()).toBe('Schwiizerdütsch')
    await press('Home')
    expect(activeOptionLabel()).toBe('Deutsch')
    // Against the narrowed list, not the whole one: End is the end of what is on
    // the screen.
    await type('tsch')
    await press('End')
    expect(activeOptionLabel()).toBe('Schwiizerdütsch')
  })

  test('Enter chooses the active option and stores that option value', async () => {
    // The failure this prevents: a keyboard route that can look but not choose.
    const engine = await mount('typeahead')
    await type('fra')
    await press('ArrowDown')
    await press('Enter')
    expect(engine.value()).toEqual({ language: 'fr' })
    // The list is put away and the box shows the answer rather than the query.
    expect(combobox().value).toBe('Français')
    expect(combobox().getAttribute('aria-expanded')).toBe('false')
  })

  test('a pointer opens the list and chooses a row', async () => {
    // The mouse route, which none of the keyboard cases touch: clicking the box
    // opens the list, and clicking a row is the same choice Enter makes. The
    // mousedown is default-prevented so DOM focus stays in the text box — without
    // that the blur handler runs first and the click lands on a list that has gone.
    const engine = await mount('typeahead')
    fireEvent.click(combobox())
    await settle()
    expect(optionLabels()).toHaveLength(5)

    const italiano = screen.getByRole('option', { name: 'Italiano' })
    expect(fireEvent.mouseDown(italiano)).toBe(false)
    fireEvent.click(italiano)
    await settle()

    expect(engine.value()).toEqual({ language: 'it' })
    expect(combobox().value).toBe('Italiano')
  })

  test('leaves Enter and Escape alone when no list is showing', async () => {
    // Enter belongs to the FORM: a control that swallowed it would break
    // submitting from the keyboard. Escape with nothing open and nothing typed has
    // nothing to abandon, and taking it would swallow the key a dialog or drawer
    // around the form is listening for.
    await mount('typeahead')
    expect(fireEvent.keyDown(combobox(), { key: 'Enter' })).toBe(true)
    expect(fireEvent.keyDown(combobox(), { key: 'Escape' })).toBe(true)
  })

  test('Enter with nothing arrowed to puts the list away and stores nothing', async () => {
    // A path the coverage report found unreached, and a real one: somebody types,
    // reads the narrowed list, and presses Enter without arrowing to a row. It must
    // not choose the first match on their behalf — that is an answer nobody gave —
    // and it must not submit the form either, which is what Enter would do if the
    // control let it through while a popup was on the screen.
    const engine = await mount('typeahead')
    await type('tsch')
    expect(screen.getAllByRole('option')).toHaveLength(2)
    await press('Enter')

    expect(engine.value()).toEqual({})
    expect(combobox().getAttribute('aria-expanded')).toBe('false')
  })

  test('marks the chosen option selected and the arrowed-over one only active', async () => {
    // The failure this prevents, and it is the commonest defect in this pattern:
    // aria-selected following the arrow keys, so a screen reader hears the answer
    // change every time somebody presses Down to look at the next row.
    //
    // THREE presses, not two, is what makes this case discriminate, and the earlier
    // version had two. `Français` is the second of five options, so arrowing twice
    // from the top lands on the row that is also the chosen one -- the two facts
    // coincide there, and a control whose aria-selected followed the arrow keys
    // passed. Measured in both renderers: inverting the binding to `activeValue`
    // left all 24 cases green. One more press separates them.
    const engine = await mount('typeahead')
    await type('fra')
    await press('ArrowDown')
    await press('Enter')
    await type('')
    await press('ArrowDown')
    await press('ArrowDown')
    await press('ArrowDown')

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
    await press('ArrowUp')
    expect(activeOptionLabel()).toBe('Français')
    expect(selectedLabels()).toEqual(['Français'])
    await press('ArrowUp')
    expect(activeOptionLabel()).toBe('Deutsch')
    expect(selectedLabels()).toEqual(['Français'])
    expect(engine.value()).toEqual({ language: 'fr' })
  })

  test('Escape puts the list away, keeps the answer and abandons the query', async () => {
    // The failure this prevents: Escape clearing the answer. Escape means "never
    // mind about this list", not "delete what I chose earlier".
    const engine = await mount('typeahead')
    await type('fra')
    await press('ArrowDown')
    await press('Enter')
    await type('ital')
    await press('Escape')

    expect(engine.value()).toEqual({ language: 'fr' })
    expect(combobox().value).toBe('Français')
    expect(combobox().getAttribute('aria-expanded')).toBe('false')
  })

  test('Tab away with a partial query stores nothing and shows the answer again', async () => {
    // The failure this prevents: half a word left in the box, or worse, stored. A
    // select cannot hold `ital`, so neither may this.
    const engine = await mount('typeahead')
    await type('fra')
    await press('ArrowDown')
    await press('Enter')
    await type('ital')
    await blur()

    expect(engine.value()).toEqual({ language: 'fr' })
    expect(combobox().value).toBe('Français')
  })

  test('leaving with a query that matches nothing stores nothing', async () => {
    // The answer that must not be "store the text". Nothing was chosen, so
    // nothing is the answer — and the box goes back to showing that.
    const engine = await mount('typeahead')
    await type('klingon')
    await blur()

    expect(engine.value()).toEqual({})
    expect(combobox().value).toBe('')
  })

  test('emptying the box and leaving clears the answer, as the empty option does', async () => {
    // Without this the typeahead can reach a state the plain select cannot leave:
    // a select has an empty first option, so un-answering is always available,
    // and a widget may not take it away.
    const engine = await mount('typeahead')
    await type('fra')
    await press('ArrowDown')
    await press('Enter')
    await type('')
    await blur()

    expect(engine.value()).toEqual({ language: null })
    expect(combobox().value).toBe('')
  })

  test('stores exactly what the default control stores', async () => {
    // The structural claim of 0065, asserted rather than trusted: same schema,
    // same choice, same submission — and the same bytes as React's copy of this
    // case produces, which is the claim two renderers exist to make.
    const plain = createFormEngine({ schema: schemaWith() })
    plain.setValue(['language'], 'fr')

    const widgeted = await mount('typeahead')
    await type('fra')
    await press('ArrowDown')
    await press('Enter')

    expect(JSON.stringify(widgeted.value())).toBe(JSON.stringify(plain.value()))
  })

  test('says when nothing matches, in a region that was already there', async () => {
    // Two failures. One: a list that goes silently empty, which reads as a broken
    // control rather than as a query with no answers. Two: a live region created
    // at the moment it gets its text, which several screen readers do not
    // announce — so the element exists from the start and is empty.
    await mount('typeahead')
    expect(screen.getByRole('status').textContent).toBe('')
    await type('klingon')
    expect(screen.getByRole('status').textContent).not.toBe('')
    // And the popup is honestly collapsed, because nothing is popped up.
    expect(combobox().getAttribute('aria-expanded')).toBe('false')
    // Arrowing over a list with nothing in it names nothing, rather than pointing
    // aria-activedescendant at a row that is not there.
    await press('ArrowDown')
    expect(combobox().hasAttribute('aria-activedescendant')).toBe(false)
  })

  test('follows a value set from outside the control', async () => {
    // The bug this repository has now written twice: a component that reads the
    // engine's snapshot without subscribing renders once and never again — in
    // Angular because a plain method call is not a signal an OnPush component
    // re-runs for, and `computed()` over one has no reactive dependency at all.
    const engine = await mount('typeahead')
    engine.setValue(['language'], 'it')
    await settle()
    expect(combobox().value).toBe('Italiano')
  })
})

describe('an auditor over the three states', () => {
  /**
   * The same auditor the conformance suite runs, over the same rule set, in the
   * three states this control has.
   *
   * Here rather than only in the shared suite because no conformance fixture uses
   * the widget: the driver answers a field by writing a value into its control,
   * and a typeahead's control does not take one. So the audit that would otherwise
   * have covered this markup is run directly, on the states a fixture cannot reach.
   */
  const violationsNow = async (): Promise<string[]> => {
    const disabled = { ...ACCESSIBILITY_EXCLUSIONS, ...ACCESSIBILITY_UNMEASURABLE_IN_JSDOM }
    const results = await axe.run(document.body, {
      runOnly: { type: 'tag', values: [...ACCESSIBILITY_TAGS] },
      rules: Object.fromEntries(Object.keys(disabled).map((id) => [id, { enabled: false }])),
      resultTypes: ['violations'],
    })
    return results.violations.map(
      (violation) => `${violation.id}: ${violation.nodes[0]?.html ?? ''}`,
    )
  }

  test('finds nothing collapsed, open, or open with no matches', async () => {
    // The failures this prevents, reported by axe and none of them visible in a
    // render assertion: a combobox missing aria-expanded or aria-controls, an
    // aria-controls that resolves to nothing, and a listbox whose children are not
    // options. Checked by deleting `aria-controls` and watching this report
    // `aria-required-attr`. It does NOT cover the listbox's accessible name -- axe
    // in jsdom says nothing about that, which is why a case above asserts it.
    await mount('typeahead')
    expect(await violationsNow()).toEqual([])

    await press('ArrowDown')
    expect(await violationsNow()).toEqual([])

    await type('klingon')
    expect(await violationsNow()).toEqual([])
  }, 20_000)
})
