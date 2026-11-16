import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, test, vi } from 'vitest'
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
  /** Pastes at the focused control, then lets the view settle. */
  paste(text: string): Promise<void>
  /** Presses keys at the focused control, then lets the view settle. */
  keyboard(keys: string): Promise<void>
  /** Lets the view settle after an event the test dispatched itself. */
  settle(): Promise<void>
}

const mountOn = async (keyPath: readonly string[], document: FormSchema = paged): Promise<Mounted> => {
  const session = createBuilderSession(document)
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
      await user.click(element)
      await settle()
    },
    type: async (element, text) => {
      await user.type(element, text)
      await settle()
    },
    select: async (element, value) => {
      await user.selectOptions(element, value)
      await settle()
    },
    paste: async (text) => {
      await user.paste(text)
      await settle()
    },
    keyboard: async (keys) => {
      await user.keyboard(keys)
      await settle()
    },
    settle,
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

    const kinds = [...kindChooser().querySelectorAll('option')].map((option) => option.getAttribute('value'))
    expect(kinds).toEqual(['skip'])
  })

  test('and a skip is addressed by the page key, not by a path', async () => {
    const { session, click } = await mountOn(['visa'])

    await click(screen.getByRole('button', { name: /add a rule/i }))
    await click(screen.getByRole('button', { name: /^add rule$/i }))

    expect(rulesOf(session)[0]).toMatchObject({ kind: 'skip', target: 'visa' })
  })

  // As React's panel (0198): a rule that rejects an answer says why, under a code of its own.
  test('a rule that rejects an answer asks what it says, and carries it', async () => {
    const { session, click, type, select } = await mountOn(['about', 'total'], { ...paged, specVersion: '5' })

    await click(screen.getByRole('button', { name: /add a rule/i }))
    await select(kindChooser(), 'validate')
    expect(screen.getByRole('button', { name: /^add rule$/i }).hasAttribute('disabled')).toBe(true)
    await type(screen.getByRole('textbox', { name: 'What it says when an answer is rejected' }), 'Too much.')
    await click(screen.getByRole('button', { name: /^add rule$/i }))

    expect(rulesOf(session)).toMatchObject([{ kind: 'validate', code: 'condition', message: 'Too much.' }])
  })

  test('and does not ask where the document cannot hold one', async () => {
    const { session, click, select } = await mountOn(['about', 'total'])

    await click(screen.getByRole('button', { name: /add a rule/i }))
    await select(kindChooser(), 'validate')
    expect(screen.queryByRole('textbox', { name: 'What it says when an answer is rejected' })).toBeNull()
    await click(screen.getByRole('button', { name: /^add rule$/i }))

    expect(rulesOf(session)).toMatchObject([{ kind: 'validate' }])
    expect(rulesOf(session)[0]).not.toHaveProperty('message')
  })

  // As React's panel: the list shows what a rule that rejects an answer says.
  test('lists a rule with what it says', async () => {
    await mountOn(['about', 'total'], {
      ...paged,
      specVersion: '5',
      logic: { rules: [{ target: 'total', kind: 'validate', cel: 'total > 0.0', code: 'given', message: 'Enter a total above nothing.' }] },
    })
    expect(screen.getByRole('listitem').textContent).toContain('Enter a total above nothing.')
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

    expect(screen.getByRole<HTMLButtonElement>('button', { name: /^add rule$/i }).disabled).toBe(true)
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

describe('the condition editor, rebuilt on one model (0127)', () => {
  // The cases React's panel is held to, near-copied on purpose.
  const trip: FormSchema = {
    specVersion: '4',
    id: 'trip',
    title: 'Trip',
    model: {
      fields: [
        {
          key: 'about',
          type: 'page',
          fields: [
            {
              key: 'country',
              type: 'radio',
              label: 'Country',
              options: [
                { value: 'CH', label: 'Switzerland' },
                { value: 'DE', label: 'Germany' },
              ],
            },
            { key: 'age', type: 'number', label: 'Age' },
          ],
        },
        { key: 'terms', type: 'checkbox', label: 'Terms' },
        { key: 'leave', type: 'date', label: 'Leaving' },
        { key: 'canton', type: 'text', label: 'Canton' },
      ],
    },
  }

  const open = async () => {
    const session = createBuilderSession(trip)
    const view = await render(FormancyLogicPanel, {
      componentInputs: { session, keyPath: ['canton'] },
      providers: [provideZonelessChangeDetection()],
    })
    const user = userEvent.setup()
    const settle = async (): Promise<void> => void (await view.fixture.whenStable())
    await settle()
    await user.click(screen.getByRole('button', { name: 'Add a rule' }))
    await settle()
    return { session, user, settle }
  }

  test('a field inside a page is compared at the path the engine reads', async () => {
    const { user, settle } = await open()

    await user.selectOptions(screen.getByLabelText('Value'), 'CH')
    await settle()

    expect(screen.getByText('country == "CH"')).toBeTruthy()
  })

  test('a choice is compared with one of its own options, and a date with a date', async () => {
    const { user, settle } = await open()

    expect([...screen.getByLabelText<HTMLSelectElement>('Value').options].map((o) => o.text.trim())).toEqual(['Choose a value', 'Switzerland', 'Germany'])
    await user.selectOptions(screen.getByLabelText('Field'), 'leave')
    await settle()
    expect(screen.getByLabelText<HTMLInputElement>('Value').type).toBe('date')
  })

  test('and the comparisons offered are the ones the field can take', async () => {
    const { user, settle } = await open()
    const offered = () => [...screen.getByLabelText<HTMLSelectElement>('Comparison').options].map((o) => o.value)

    await user.selectOptions(screen.getByLabelText('Field'), 'leave')
    await settle()
    expect(offered()).toContain('isBefore')
    expect(offered()).not.toContain('contains')
  })

  test('"(A and B) or C" can be built, and is written as one expression the engine accepts', async () => {
    const { session, user, settle } = await open()
    await user.selectOptions(screen.getByLabelText('Value'), 'CH')
    await settle()

    await user.click(screen.getByRole('button', { name: 'Add a group' }))
    await settle()
    await user.selectOptions(screen.getByLabelText('Field 2'), 'age')
    await settle()
    await user.selectOptions(screen.getByLabelText('Comparison 2'), 'isAtLeast')
    await settle()
    await user.type(screen.getByLabelText('Value 2'), '18')
    await settle()
    await user.click(screen.getByRole('button', { name: 'Add a comparison to group 1' }))
    await settle()
    await user.selectOptions(screen.getByLabelText('Field 3'), 'terms')
    await settle()
    await user.selectOptions(screen.getByLabelText('Match'), 'any')
    await settle()
    await user.click(screen.getByRole('button', { name: 'Add rule' }))
    await settle()

    expect(session.document().logic?.rules[0]?.cel).toBe('country == "CH" || (age != null && age >= 18.0 && terms == true)')
    expect(session.canPublish().valid).toBe(true)
  })
})

describe('a rule on a field in a repeater row', () => {
  // Addressed by its dotted data path, `items.note`, every rule the panel wrote on
  // a field in a row was refused: no field has that path (0129).
  const order = {
    specVersion: '4',
    id: 'order',
    title: 'Order',
    model: {
      fields: [
        { key: 'country', type: 'text', label: 'Country' },
        {
          key: 'items',
          type: 'repeater',
          label: 'Items',
          fields: [
            { key: 'qty', type: 'number', label: 'Quantity' },
            { key: 'note', type: 'text', label: 'Note' },
          ],
        },
      ],
    },
  } as unknown as FormSchema

  test('compares a field of its own row, named as being in this row, and is added', async () => {
    const session = createBuilderSession(order)
    const view = await render(FormancyLogicPanel, {
      componentInputs: { session, keyPath: ['items', 'note'] },
      providers: [provideZonelessChangeDetection()],
    })
    const user = userEvent.setup()
    const settle = async (): Promise<void> => void (await view.fixture.whenStable())
    await settle()
    await user.click(screen.getByRole('button', { name: 'Add a rule' }))
    await settle()

    const field = screen.getByLabelText<HTMLSelectElement>('Field')
    expect([...field.options].map((option) => option.text.trim())).toContain('Quantity in this row')
    await user.selectOptions(field, 'items[].qty')
    await settle()
    await user.selectOptions(screen.getByLabelText('Comparison'), 'isAtLeast')
    await settle()
    await user.type(screen.getByLabelText('Value'), '3')
    await settle()
    await user.click(screen.getByRole('button', { name: 'Add rule' }))
    await settle()

    expect(session.document().logic?.rules).toMatchObject([{ target: 'items[].note', kind: 'visible', cel: 'item.qty != null && item.qty >= 3.0' }])
    expect(session.canPublish().valid).toBe(true)
  })
})

describe('a time or a date and time with a precision (0238)', () => {
  const log: FormSchema = {
    specVersion: '6',
    id: 'log',
    title: 'Log',
    model: {
      fields: [
        { key: 'at', type: 'datetime', label: 'At', precision: 3 },
        { key: 'clock', type: 'time', label: 'Clock', precision: 0 },
        { key: 'plain', type: 'datetime', label: 'Plain' },
        { key: 'note', type: 'text', label: 'Note' },
      ],
    },
  }

  const started = Intl.DateTimeFormat().resolvedOptions().timeZone
  afterEach(() => {
    vi.stubEnv('TZ', started)
    vi.unstubAllEnvs()
  })

  const open = async (field: string, operator = 'isAfter') => {
    const mounted = await mountOn(['note'], log)
    await mounted.click(screen.getByRole('button', { name: 'Add a rule' }))
    await mounted.select(screen.getByLabelText('Field'), field)
    await mounted.select(screen.getByLabelText('Comparison'), operator)
    return { ...mounted, box: () => screen.getByLabelText<HTMLInputElement>('Value') }
  }

  test('its value box is typed, with the mask as the hint', async () => {
    // Left as the browser's datetime-local, a seventh digit cannot be typed and the rule
    // written is refused at publish.
    const { box } = await open('at')

    expect(box().type).toBe('text')
    expect(box().placeholder).toBe('____-__-__ __:__:__.___')
    expect(box().inputMode).toBe('numeric')
  })

  test('digits typed are written as the instant at the field width', async () => {
    // Written at version 5's width the rule is a comparison across widths and publish refuses it.
    vi.stubEnv('TZ', 'Europe/Zurich')
    const { session, type, click, box } = await open('at')
    await type(box(), '20261115140327415')

    expect(screen.getByText('at != null && at > "2026-11-15T13:03:27.415Z"')).toBeTruthy()
    await click(screen.getByRole('button', { name: 'Add rule' }))
    expect(session.canPublish().valid).toBe(true)
  })

  test('a pasted UTC instant is stored as that instant', async () => {
    // Read as typing, an instant's Z is dropped and its digits become the author's own clock.
    vi.stubEnv('TZ', 'Europe/Zurich')
    const { click, paste, box } = await open('at')
    await click(box())
    await paste('2026-11-15T13:03:27.415Z')

    expect(screen.getByText('at != null && at > "2026-11-15T13:03:27.415Z"')).toBeTruthy()
  })

  test('a pasted instant in the hour the clocks repeat is kept as it was', async () => {
    // Zurich shows 02:30 twice on 25 October. A row holding the typed digits turned the later
    // 01:30Z into the earlier 00:30Z; the renderer keeps it, and so must the editor.
    vi.stubEnv('TZ', 'Europe/Zurich')
    const { click, paste, box } = await open('at', 'is')
    await click(box())
    await paste('2026-10-25T01:30:00.000Z')

    expect(screen.getByText('at == "2026-10-25T01:30:00.000Z"')).toBeTruthy()
  })

  test('a dropped instant is stored as that instant', async () => {
    // A drop reaching the mask as typing dropped the Z and stored the digits as the author's clock.
    vi.stubEnv('TZ', 'Europe/Zurich')
    const { settle, box } = await open('at')
    const drop = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent
    Object.defineProperty(drop, 'dataTransfer', { value: { getData: () => '2026-11-15T13:03:27.415Z' } })
    box().dispatchEvent(drop)
    await settle()

    expect(screen.getByText('at != null && at > "2026-11-15T13:03:27.415Z"')).toBeTruthy()
  })

  test('a dropped instant in the hour the clocks repeat is kept as it was', async () => {
    // As for a paste: the later 01:30Z must not come back as the earlier 00:30Z.
    vi.stubEnv('TZ', 'Europe/Zurich')
    const { settle, box } = await open('at', 'is')
    const drop = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent
    Object.defineProperty(drop, 'dataTransfer', { value: { getData: () => '2026-10-25T01:30:00.000Z' } })
    box().dispatchEvent(drop)
    await settle()

    expect(screen.getByText('at == "2026-10-25T01:30:00.000Z"')).toBeTruthy()
  })

  test('digits pasted into part of the box are typed there', async () => {
    // A fragment is typing, placed by the mask as the same keystrokes, not an answer of its own.
    vi.stubEnv('TZ', 'Europe/Zurich')
    const { type, paste, box } = await open('at')
    await type(box(), '20261115')
    await paste('1403')

    expect(box().value.startsWith('2026-11-15 14:03')).toBe(true)
  })

  test('Delete removes the digit after the caret', async () => {
    // Read as a backspace, the mask removed the digit before the caret instead.
    const { type, keyboard, box } = await open('at')
    await type(box(), '2026')
    box().setSelectionRange(0, 0)
    await keyboard('{Delete}')

    expect(box().value.startsWith('026')).toBe(true)
  })

  test('a time with a precision is typed and written as typed', async () => {
    // A time is not zoned, so its stored answer is its digits formatted.
    const { type, box } = await open('clock')
    await type(box(), '140327')

    expect(box().placeholder).toBe('__:__:__')
    expect(screen.getByText('clock != null && clock > "14:03:27"')).toBeTruthy()
  })

  test('a field without a precision keeps the browser box', async () => {
    // The version 5 control is unchanged for a field that declares none.
    const { box } = await open('plain')

    expect(box().type).toBe('datetime-local')
  })
})
