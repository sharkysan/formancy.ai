import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import { createBuilderSession } from '@formancy/builder-core'
import type { BuilderSession } from '@formancy/builder-core'
import type { FormSchema, LogicRule } from '@formancy/spec'
import { FormancyLogicPanel } from './logic-panel'

/**
 * Authoring a rule, which must behave as the React panel does.
 *
 * Which kinds exist, what each is called, what it is written with and what it
 * compiles to all come from `@formancy/builder-core` — so what these cases hold
 * is the surface, not the decisions. That split is the point: a kind the format
 * grows appears in both builders or in neither, and `computed` was in neither
 * until the shared table was derived from the spec.
 */
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

const paged: FormSchema = {
  specVersion: '3',
  id: 'trip',
  title: 'Trip',
  model: {
    fields: [
      {
        key: 'about',
        type: 'page',
        label: 'About you',
        fields: [
          { key: 'needsVisa', type: 'checkbox', label: 'Do you need a visa?' },
          { key: 'total', type: 'number', label: 'Total' },
        ],
      },
      {
        key: 'visa',
        type: 'page',
        label: 'Visa details',
        fields: [{ key: 'passport', type: 'text', label: 'Passport number' }],
      },
    ],
  },
} as unknown as FormSchema

interface Mounted {
  session: BuilderSession
  click(element: Element): Promise<void>
  type(element: Element, text: string): Promise<void>
  select(element: Element, value: string): Promise<void>
}

const mountOn = async (keyPath: readonly string[]): Promise<Mounted> => {
  const session = createBuilderSession(paged)
  const view = await render(FormancyLogicPanel, {
    componentInputs: { session, keyPath },
    providers: [provideZonelessChangeDetection()],
  })
  await view.fixture.whenStable()

  const user = userEvent.setup()
  const settle = async (): Promise<void> => {
    await view.fixture.whenStable()
  }
  return {
    session,
    click: async (element) => {
      await user.click(element as HTMLElement)
      await settle()
    },
    type: async (element, text) => {
      await user.type(element as HTMLElement, text)
      await settle()
    },
    select: async (element, value) => {
      await user.selectOptions(element as HTMLElement, value)
      await settle()
    },
  }
}

const rulesOf = (session: BuilderSession): LogicRule[] => session.document().logic?.rules ?? []

const kindChooser = (): HTMLElement => screen.getByRole('combobox', { name: /what the rule does/i })

describe('authoring a rule', () => {
  test('a field with none says so plainly', async () => {
    await mountOn(['about', 'needsVisa'])

    expect(screen.getByText('This field always behaves the same way.')).toBeTruthy()
  })

  test('a condition is written as a comparison and stored as CEL', async () => {
    const { session, click } = await mountOn(['about', 'total'])

    await click(screen.getByRole('button', { name: /add a rule/i }))
    await click(screen.getByRole('button', { name: /^add rule$/i }))

    const rule = rulesOf(session)[0]
    expect(rule?.kind).toBe('visible')
    expect(typeof rule?.cel).toBe('string')
    // The structured form travels beside it and is never evaluated: two
    // evaluable forms could disagree about which one meant what.
    expect(rule?.editor).toBeDefined()
  })

  test('and a rule on a field inside a page is addressed by its DATA path', async () => {
    // The bug the shared core removes: joining the key path made every rule on a
    // field inside a page refused with "No field has the data path".
    const { session, click } = await mountOn(['about', 'total'])

    await click(screen.getByRole('button', { name: /add a rule/i }))
    await click(screen.getByRole('button', { name: /^add rule$/i }))

    expect(rulesOf(session)[0]?.target).toBe('total')
  })

  test('a page is offered only the kind that applies to one', async () => {
    // `visible` on a page is refused by the validator — a page has no data path
    // — so offering it would be offering a choice refused every time.
    const { click } = await mountOn(['visa'])

    await click(screen.getByRole('button', { name: /add a rule/i }))

    const kinds = [...kindChooser().querySelectorAll('option')].map((option) =>
      option.getAttribute('value'),
    )
    expect(kinds).toEqual(['skip'])
  })

  test('and a skip is addressed by the page key, not by a path', async () => {
    const { session, click } = await mountOn(['visa'])

    await click(screen.getByRole('button', { name: /add a rule/i }))
    await click(screen.getByRole('button', { name: /^add rule$/i }))

    expect(rulesOf(session)[0]).toMatchObject({ kind: 'skip', target: 'visa' })
  })

  test('a check asks for a name rather than a condition', async () => {
    const { session, click, type, select } = await mountOn(['about', 'total'])

    await click(screen.getByRole('button', { name: /add a rule/i }))
    await select(kindChooser(), 'check')
    // Offering a comparison beside a check would be offering a condition the
    // rule throws away.
    expect(screen.queryByRole('button', { name: /add a comparison/i })).toBeNull()

    await type(screen.getByRole('textbox', { name: /which check/i }), 'visa-eligible')
    await click(screen.getByRole('button', { name: /^add rule$/i }))

    const rule = rulesOf(session)[0]
    expect(rule?.check).toBe('visa-eligible')
    expect(rule?.cel).toBeUndefined()
  })

  test('a calculation asks for an expression, because it produces a value', async () => {
    /*
     * `computed` was in the format, honoured by both renderers, and in neither
     * builder's kind table — a calculated field was a thing a developer could
     * hand-write and an author could not make. Found by deriving the table from
     * the spec rather than reading it.
     */
    const { session, click, type, select } = await mountOn(['about', 'total'])

    await click(screen.getByRole('button', { name: /add a rule/i }))
    await select(kindChooser(), 'computed')
    await type(screen.getByRole('textbox', { name: /the calculation/i }), 'needsVisa ? 1 : 0')
    await click(screen.getByRole('button', { name: /^add rule$/i }))

    const rule = rulesOf(session)[0]
    expect(rule?.kind).toBe('computed')
    expect(rule?.cel).toBe('needsVisa ? 1 : 0')
    // No editor metadata: the comparison editor did not write this and cannot
    // regenerate it.
    expect(rule?.editor).toBeUndefined()
  })

  test('and an empty one cannot be added, because it calculates nothing', async () => {
    const { click, select } = await mountOn(['about', 'total'])

    await click(screen.getByRole('button', { name: /add a rule/i }))
    await select(kindChooser(), 'computed')

    expect((screen.getByRole('button', { name: /^add rule$/i }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  test('the expression is shown before the rule is added, not after', async () => {
    // Somebody who can read CEL can check the condition means what they chose.
    const { click } = await mountOn(['about', 'total'])

    await click(screen.getByRole('button', { name: /add a rule/i }))

    const preview = document.querySelector('[data-formancy-part="logic-preview"]')
    expect(preview?.textContent?.trim().length).toBeGreaterThan(0)
  })

  test('a second comparison brings the join control with it, and not before', async () => {
    // A control that does nothing is a control somebody has to work out is
    // irrelevant.
    const { click } = await mountOn(['about', 'total'])
    await click(screen.getByRole('button', { name: /add a rule/i }))
    expect(screen.queryByRole('combobox', { name: /match/i })).toBeNull()

    await click(screen.getByRole('button', { name: /add a comparison/i }))

    expect(screen.getByRole('combobox', { name: /match/i })).toBeTruthy()
  })

  test('the first comparison cannot be removed, because an empty group is refused', async () => {
    // `compileGroup` refuses an empty group rather than compiling to an
    // expression that always passes, so the interface must not be able to ask
    // for one.
    const { click } = await mountOn(['about', 'total'])
    await click(screen.getByRole('button', { name: /add a rule/i }))

    expect(screen.queryByRole('button', { name: /remove comparison 1/i })).toBeNull()

    await click(screen.getByRole('button', { name: /add a comparison/i }))
    expect(screen.getByRole('button', { name: /remove comparison 2/i })).toBeTruthy()
  })

  test('each remove button says which rule it removes', async () => {
    const { click } = await mountOn(['about', 'total'])
    await click(screen.getByRole('button', { name: /add a rule/i }))
    await click(screen.getByRole('button', { name: /^add rule$/i }))

    // "Remove" on its own is a button a screen reader cannot tell from the next
    // one, on a list where getting the wrong one deletes a rule.
    expect(screen.getByRole('button', { name: 'Remove the rule “Show this field when” on total' })).toBeTruthy()
  })

  test('and removing one takes it out of the document', async () => {
    const { session, click } = await mountOn(['about', 'total'])
    await click(screen.getByRole('button', { name: /add a rule/i }))
    await click(screen.getByRole('button', { name: /^add rule$/i }))

    await click(screen.getByRole('button', { name: /remove the rule “show this field when”/i }))

    expect(rulesOf(session)).toEqual([])
  })
})
