import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createBuilderSession } from '@formancy/builder-core'
import type { FormSchema, LogicRule } from '@formancy/spec'
import { LogicPanel } from './logic-panel.js'

afterEach(cleanup)

const schema: FormSchema = {
  specVersion: '1',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'country', type: 'text', label: 'Country' },
      { key: 'canton', type: 'text', label: 'Canton' },
      { key: 'qty', type: 'number', label: 'Quantity' },
    ],
  },
}

const mount = (
  initial: FormSchema = schema,
): ReturnType<typeof createBuilderSession> => {
  const session = createBuilderSession(initial)
  render(<LogicPanel session={session} keyPath={['canton']} />)
  return session
}

const rulesOf = (session: ReturnType<typeof createBuilderSession>): LogicRule[] =>
  session.document().logic?.rules ?? []

describe('authoring a rule', () => {
  test('a field with none says so plainly', () => {
    mount()

    expect(screen.getByText('This field always behaves the same way.')).toBeTruthy()
  })

  test('the expression is previewed before the rule is added', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByRole('button', { name: 'Add a rule' }))

    await user.selectOptions(screen.getByLabelText('Field'), 'country')
    await user.type(screen.getByLabelText('Value'), 'CH')

    // Somebody who can read CEL should be able to check the condition means
    // what they chose, before committing to it.
    expect(screen.getByText('country == "CH"')).toBeTruthy()
  })

  test('adding it writes CEL, and keeps the condition as editor metadata', async () => {
    const user = userEvent.setup()
    const session = mount()
    await user.click(screen.getByRole('button', { name: 'Add a rule' }))

    await user.selectOptions(screen.getByLabelText('Field'), 'country')
    await user.type(screen.getByLabelText('Value'), 'CH')
    await user.click(screen.getByRole('button', { name: 'Add rule' }))

    expect(rulesOf(session)).toEqual([
      {
        target: 'canton',
        kind: 'visible',
        // Byte-identical to what a single comparison produced before groups
        // existed: no join, no parentheses. Otherwise every form would read as
        // changed the moment somebody opened it.
        cel: 'country == "CH"',
        // Never evaluated — it exists so the panel can reopen the condition
        // rather than parse CEL back. CEL stays the single source of truth.
        //
        // The GROUP now, rather than a bare condition. One shape for one and for
        // many, which is worth more than keeping this object unchanged: the field
        // is documented as regenerated metadata, nothing reads it yet, and two
        // shapes for one field is the kind of thing that rots.
        editor: { join: 'all', conditions: [{ field: 'country', operator: 'is', value: 'CH' }] },
      },
    ])
  })

  test('a second comparison can be added, and both are previewed', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByRole('button', { name: 'Add a rule' }))
    await user.selectOptions(screen.getByLabelText('Field'), 'country')
    await user.type(screen.getByLabelText('Value'), 'CH')

    await user.click(screen.getByRole('button', { name: 'Add a comparison' }))

    // The second row's controls are named so they are distinguishable: "Field"
    // three times over tells a screen-reader user nothing about which row they
    // are in.
    await user.selectOptions(screen.getByLabelText('Field 2'), 'qty')
    await user.selectOptions(screen.getByLabelText('Comparison 2'), 'isMoreThan')
    await user.type(screen.getByLabelText('Value 2'), '5')

    expect(screen.getByText('country == "CH" && qty > 5.0')).toBeTruthy()
  })

  test('the join can be any instead of all', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByRole('button', { name: 'Add a rule' }))
    await user.selectOptions(screen.getByLabelText('Field'), 'country')
    await user.type(screen.getByLabelText('Value'), 'CH')
    await user.click(screen.getByRole('button', { name: 'Add a comparison' }))
    await user.selectOptions(screen.getByLabelText('Field 2'), 'canton')
    await user.type(screen.getByLabelText('Value 2'), 'ZH')

    await user.selectOptions(screen.getByLabelText('Match'), 'any')

    expect(screen.getByText('country == "CH" || canton == "ZH"')).toBeTruthy()
  })

  test('the join is only offered once there is something to join', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByRole('button', { name: 'Add a rule' }))

    // One comparison has nothing to match "all" or "any" against, and a control
    // that does nothing is a control somebody has to work out is irrelevant.
    expect(screen.queryByLabelText('Match')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Add a comparison' }))
    expect(screen.getByLabelText('Match')).toBeTruthy()
  })

  test('a comparison can be taken back out, naming which one', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByRole('button', { name: 'Add a rule' }))
    await user.selectOptions(screen.getByLabelText('Field'), 'country')
    await user.type(screen.getByLabelText('Value'), 'CH')
    await user.click(screen.getByRole('button', { name: 'Add a comparison' }))
    await user.selectOptions(screen.getByLabelText('Field 2'), 'qty')

    await user.click(screen.getByRole('button', { name: 'Remove comparison 2' }))

    // Back to one, and the join goes with it.
    expect(screen.getByText('country == "CH"')).toBeTruthy()
    expect(screen.queryByLabelText('Match')).toBeNull()
    expect(screen.queryByLabelText('Field 2')).toBeNull()
  })

  test('the first comparison cannot be removed, because a rule needs one', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByRole('button', { name: 'Add a rule' }))

    // compileGroup throws on an empty group rather than compiling to an
    // expression that always passes. The UI should not be able to ask for that.
    expect(screen.queryByRole('button', { name: /Remove comparison 1/ })).toBeNull()
  })

  test('a two-comparison rule is written as one expression the engine accepts', async () => {
    const user = userEvent.setup()
    const session = mount()
    await user.click(screen.getByRole('button', { name: 'Add a rule' }))
    await user.selectOptions(screen.getByLabelText('Field'), 'country')
    await user.type(screen.getByLabelText('Value'), 'CH')
    await user.click(screen.getByRole('button', { name: 'Add a comparison' }))
    await user.selectOptions(screen.getByLabelText('Field 2'), 'qty')
    await user.selectOptions(screen.getByLabelText('Comparison 2'), 'isMoreThan')
    await user.type(screen.getByLabelText('Value 2'), '5')
    await user.click(screen.getByRole('button', { name: 'Add rule' }))

    const rules = rulesOf(session)
    expect(rules[0]?.cel).toBe('country == "CH" && qty > 5.0')
    // The session accepted it, which means the engine type-checked the whole
    // expression -- the point of compiling rather than concatenating.
    expect(session.canPublish().valid).toBe(true)
  })

  test('a number typed into the box compares as a number', async () => {
    const user = userEvent.setup()
    const session = mount()
    await user.click(screen.getByRole('button', { name: 'Add a rule' }))

    await user.selectOptions(screen.getByLabelText('Field'), 'qty')
    await user.selectOptions(screen.getByLabelText('Comparison'), 'isMoreThan')
    await user.type(screen.getByLabelText('Value'), '5')
    await user.click(screen.getByRole('button', { name: 'Add rule' }))

    // `qty > "5"` would be a type error CEL catches at save time. The double
    // is what makes it compile against a number field.
    expect(rulesOf(session)[0]?.cel).toBe('qty > 5.0')
  })

  test('a comparison that needs no value hides the box', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByRole('button', { name: 'Add a rule' }))

    await user.selectOptions(screen.getByLabelText('Comparison'), 'isAnswered')

    expect(screen.queryByLabelText('Value')).toBeNull()
    expect(screen.getByText('country != null')).toBeTruthy()
  })

  test('the rule the builder writes is one the engine accepts', async () => {
    const user = userEvent.setup()
    const session = mount()
    await user.click(screen.getByRole('button', { name: 'Add a rule' }))
    await user.selectOptions(screen.getByLabelText('Field'), 'country')
    await user.type(screen.getByLabelText('Value'), 'CH')

    await user.click(screen.getByRole('button', { name: 'Add rule' }))

    // builder-core commits only what validateSchema accepts, so a refused rule
    // would leave the document unchanged — and canPublish is the same verdict
    // the server will reach.
    expect(rulesOf(session)).toHaveLength(1)
    expect(session.canPublish().valid).toBe(true)
  })

  test('cancelling adds nothing', async () => {
    const user = userEvent.setup()
    const session = mount()
    await user.click(screen.getByRole('button', { name: 'Add a rule' }))

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(rulesOf(session)).toEqual([])
  })
})

describe('existing rules', () => {
  const withRule: FormSchema = {
    ...schema,
    logic: { rules: [{ target: 'canton', kind: 'visible', cel: 'country == "CH"' }] },
  }

  test('are listed with the expression they compiled to', () => {
    mount(withRule)

    expect(screen.getByText('Show this field when')).toBeTruthy()
    expect(screen.getByText('country == "CH"')).toBeTruthy()
  })

  test('each remove button says which rule it removes', () => {
    mount(withRule)

    expect(screen.getByRole('button', { name: 'Remove the visible rule on canton' })).toBeTruthy()
  })

  test('removing one takes it out of the document', async () => {
    const user = userEvent.setup()
    const session = mount(withRule)

    await user.click(screen.getByRole('button', { name: 'Remove the visible rule on canton' }))

    expect(rulesOf(session)).toEqual([])
  })

  test('only this field’s rules are shown', () => {
    mount({
      ...schema,
      logic: {
        rules: [
          { target: 'canton', kind: 'visible', cel: 'country == "CH"' },
          { target: 'qty', kind: 'required', cel: 'country == "DE"' },
        ],
      },
    })

    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})

describe('the two rule kinds spec 3 added', () => {
  /*
   * Both shipped in 0.3.0 as things a developer writes by hand, and the release
   * said so plainly rather than implying otherwise. This is the other half: the
   * builder's whole reason to exist is that an author should not have to write
   * JSON, and a rule kind nobody can reach from it is the wizard's shape all over
   * again.
   *
   * They need different treatment, and that is the point of this block. A `check`
   * has NO expression — it names a validator the deployment answers — so the
   * condition editor is the wrong surface for it. A `skip` targets a PAGE, so it
   * cannot appear on a field at all.
   */
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
          fields: [{ key: 'needsVisa', type: 'checkbox', label: 'Do you need a visa?' }],
        },
        {
          key: 'visa',
          type: 'page',
          label: 'Visa details',
          fields: [{ key: 'passport', type: 'text', label: 'Passport number' }],
        },
      ],
    },
  }

  const openOn = (keyPath: readonly string[]): ReturnType<typeof createBuilderSession> => {
    const session = createBuilderSession(paged)
    render(<LogicPanel session={session} keyPath={keyPath} />)
    return session
  }

  test('a check is offered on a field, and asks for a name rather than a condition', async () => {
    const user = userEvent.setup()
    const session = openOn(['about', 'needsVisa'])

    await user.click(screen.getByRole('button', { name: /add a rule/i }))
    await user.selectOptions(screen.getByRole('combobox', { name: /what the rule does/i }), 'check')

    // A name, because a check has no expression: the condition editor would be
    // asking for something the rule cannot carry.
    await user.type(screen.getByRole('textbox', { name: /which check/i }), 'visa-eligible')
    await user.click(screen.getByRole('button', { name: /^add rule$/i }))

    const rule = rulesOf(session)[0]
    expect(rule?.kind).toBe('check')
    expect(rule?.check).toBe('visa-eligible')
    expect(rule?.cel).toBeUndefined()
  })

  test('and the condition editor is not shown while a check is being written', async () => {
    const user = userEvent.setup()
    openOn(['about', 'needsVisa'])

    await user.click(screen.getByRole('button', { name: /add a rule/i }))
    await user.selectOptions(screen.getByRole('combobox', { name: /what the rule does/i }), 'check')

    // Offering "Country is CH" beside a check would be offering a condition the
    // rule throws away.
    expect(screen.queryByRole('combobox', { name: /field/i })).toBeNull()
  })

  test('a skip is offered on a page, and writes a condition', async () => {
    const user = userEvent.setup()
    const session = openOn(['visa'])

    await user.click(screen.getByRole('button', { name: /add a rule/i }))
    await user.selectOptions(screen.getByRole('combobox', { name: /what the rule does/i }), 'skip')
    await user.click(screen.getByRole('button', { name: /^add rule$/i }))

    const rule = rulesOf(session)[0]
    expect(rule?.kind).toBe('skip')
    expect(rule?.target).toBe('visa')
    expect(typeof rule?.cel).toBe('string')
  })

  test('a skip is not offered on a field, because a field is not a page', async () => {
    const user = userEvent.setup()
    openOn(['about', 'needsVisa'])

    await user.click(screen.getByRole('button', { name: /add a rule/i }))

    const kinds = [...screen.getByRole('combobox', { name: /what the rule does/i }).querySelectorAll('option')]
    expect(kinds.map((option) => option.getAttribute('value'))).not.toContain('skip')
  })

  test('and a page is offered nothing else, because nothing else applies to one', async () => {
    // `visible` on a page is refused by the validator -- a page has no data path
    // -- so offering it would be offering a choice refused every time.
    const user = userEvent.setup()
    openOn(['visa'])

    await user.click(screen.getByRole('button', { name: /add a rule/i }))

    const kinds = [...screen.getByRole('combobox', { name: /what the rule does/i }).querySelectorAll('option')]
    expect(kinds.map((option) => option.getAttribute('value'))).toEqual(['skip'])
  })

  test('a rule the panel wrote is one the session accepted', async () => {
    // The guard that matters: the panel composes a document the validator has
    // already refused or accepted, so a rule it writes is one that publishes.
    const user = userEvent.setup()
    const session = openOn(['visa'])

    await user.click(screen.getByRole('button', { name: /add a rule/i }))
    await user.selectOptions(screen.getByRole('combobox', { name: /what the rule does/i }), 'skip')
    await user.click(screen.getByRole('button', { name: /^add rule$/i }))

    expect(session.canPublish().valid).toBe(true)
  })
})
