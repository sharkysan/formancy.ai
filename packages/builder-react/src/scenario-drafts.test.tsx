import { useState } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createBuilderSession } from '@formancy/builder-core'
import type { AskModel, AuthoringPrompt, BuilderSession } from '@formancy/builder-core'
import type { Scenario } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { ScenarioPane } from './scenario-pane.js'

/**
 * Drafting examples with a model, inside the scenario pane.
 *
 * What the model is shown, how its answer is read and what may be kept are
 * `@formancy/builder-core`'s and tested there. What is held here is what the part does
 * with them: that nothing reaches the host until Keep, that a draft that fails can be
 * kept, that one which cannot is refused out loud, and that a draft's verdict follows the
 * form and is the one the list gives it once kept
 * ([0162](../../../docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).
 * `packages/builder-angular/src/scenario-drafts.test.ts` makes the same assertions.
 */
afterEach(cleanup)

const form: FormSchema = {
  specVersion: '2',
  id: 'leave',
  title: 'Leave',
  model: {
    fields: [
      {
        key: 'kind',
        type: 'radio',
        label: 'Kind',
        options: [
          { value: 'holiday', label: 'Holiday' },
          { value: 'other', label: 'Other' },
        ],
      },
      { key: 'reason', type: 'text', label: 'Reason' },
    ],
  },
  logic: { rules: [{ target: 'reason', kind: 'visible', cel: "kind == 'other'" }] },
}

const inverted = (): FormSchema => {
  const next = JSON.parse(JSON.stringify(form)) as FormSchema
  next.logic!.rules[0]!.cel = "kind != 'other'"
  return next
}

const EXISTING: Scenario = { name: 'already here', changes: {}, valid: true }
/** Holds against `form`. */
const HOLDS: Scenario = {
  name: 'other asks why',
  changes: { kind: 'other' },
  valid: true,
  visible: { reason: true },
}
/** Fails against `form`: the example a person might keep because the form is what is wrong. */
const FAILS: Scenario = {
  name: 'holiday asks why',
  because: 'a holiday needs a reason too',
  changes: { kind: 'holiday' },
  valid: true,
  visible: { reason: true },
}
const GHOST: Scenario = { name: 'names a ghost', changes: { region: 'north' }, valid: true }
/** Holds from an empty form, and fails from the sample below: what it says depends on where it starts. */
const STARTS_ASKING: Scenario = {
  name: 'nothing chosen hides the reason',
  changes: {},
  valid: true,
  visible: { reason: false },
}
const SAMPLE = { kind: 'other' }

/** A model answering with `answer`, recording what it was asked. */
function model(answer: string): { ask: AskModel; asked: AuthoringPrompt[] } {
  const asked: AuthoringPrompt[] = []
  return {
    asked,
    ask: (prompt) => {
      asked.push(prompt)
      return Promise.resolve(answer)
    },
  }
}

const drafting = (...items: unknown[]): string => JSON.stringify({ scenarios: items })

/** Type what the form should do and press Draft; resolves once the drafts are listed. */
async function draft(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.type(screen.getByRole('textbox', { name: /What should this form do/ }), 'Only other asks why.')
  await user.click(screen.getByRole('button', { name: 'Draft examples' }))
  return screen.findByRole('list', { name: 'Drafted examples' })
}

/** The pane as a host draws it: holding the list, and taking back what is kept. */
function Host({
  session,
  ask,
  initialValue,
}: {
  session: BuilderSession
  ask: AskModel
  initialValue?: Readonly<Record<string, unknown>>
}) {
  const [scenarios, setScenarios] = useState<readonly Scenario[]>([EXISTING])
  return (
    <ScenarioPane
      session={session}
      scenarios={scenarios}
      onChange={setScenarios}
      ask={ask}
      initialValue={initialValue}
    />
  )
}

describe('drafting', () => {
  test('is not drawn without a model, or without somewhere for a kept draft to go', () => {
    // A Keep whose result goes nowhere is worse than no Keep, and a Draft button with no
    // model behind it is a button that cannot work.
    const session = createBuilderSession(form)
    const { ask } = model(drafting(HOLDS))

    const withoutChange = render(<ScenarioPane session={session} scenarios={[]} ask={ask} />)
    expect(screen.queryByRole('button', { name: 'Draft examples' })).toBeNull()
    withoutChange.unmount()
    render(<ScenarioPane session={session} scenarios={[]} onChange={() => undefined} />)
    expect(screen.queryByRole('button', { name: 'Draft examples' })).toBeNull()
  })

  test('nothing reaches the host until Keep, and Keep hands it the list with the draft added', async () => {
    // A draft is a model's guess at what the author meant. Added to the host's list on
    // arrival, it would be checking the form before anybody had read it.
    const user = userEvent.setup()
    const changed = vi.fn()
    const { ask } = model(drafting(HOLDS, FAILS))
    render(
      <ScenarioPane session={createBuilderSession(form)} scenarios={[EXISTING]} onChange={changed} ask={ask} />,
    )

    await draft(user)
    expect(screen.getAllByRole('button', { name: /^Keep / })).toHaveLength(2)
    expect(changed).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: `Keep ${HOLDS.name}` }))

    expect(changed).toHaveBeenCalledTimes(1)
    expect(changed).toHaveBeenCalledWith([EXISTING, HOLDS])
  })

  test('a draft that fails against the form can be kept: that is where the person decides', async () => {
    // Refusing it would decide for them that the rule is right.
    const user = userEvent.setup()
    const changed = vi.fn()
    const { ask } = model(drafting(FAILS))
    render(<ScenarioPane session={createBuilderSession(form)} scenarios={[]} onChange={changed} ask={ask} />)

    const list = await draft(user)
    expect(within(list).getByText(/Does not hold against the form as it is/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: `Keep ${FAILS.name}` }))

    expect(changed).toHaveBeenCalledWith([FAILS])
  })

  test('a draft naming a field the form does not have is not kept, and the status says why', async () => {
    // It would check nothing, forever, and read as a check.
    const user = userEvent.setup()
    const changed = vi.fn()
    const { ask } = model(drafting(GHOST))
    render(<ScenarioPane session={createBuilderSession(form)} scenarios={[]} onChange={changed} ask={ask} />)

    await draft(user)
    await user.click(screen.getByRole('button', { name: `Keep ${GHOST.name}` }))

    expect(changed).not.toHaveBeenCalled()
    const statuses = screen.getAllByRole('status').map((status) => status.textContent ?? '')
    expect(statuses.some((said) => said.includes(`Not kept: ${GHOST.name} names a field`))).toBe(true)
  })

  test('a draft’s verdict follows the form, rather than being the one it arrived with', async () => {
    // A verdict stored on arrival would go on saying "holds" about a rule somebody has
    // since turned round.
    const user = userEvent.setup()
    const session = createBuilderSession(form)
    const { ask } = model(drafting(HOLDS))
    render(<ScenarioPane session={session} scenarios={[]} onChange={() => undefined} ask={ask} />)

    const list = await draft(user)
    expect(within(list).getByText('Holds against the form as it is.')).toBeTruthy()

    session.replaceDocument(inverted())

    await waitFor(() => expect(within(list).getByText(/Does not hold against the form as it is/)).toBeTruthy())
  })

  test('and is the verdict the list gives it once kept', async () => {
    /*
     * The draft is run alone, the list as a whole; both with the pane's own sample and
     * mode. If they ran differently, somebody would keep an example on one verdict and
     * read another in the list.
     */
    const user = userEvent.setup()
    const { ask } = model(drafting(STARTS_ASKING))
    render(<Host session={createBuilderSession(form)} ask={ask} initialValue={SAMPLE} />)

    const list = await draft(user)
    const before = within(list)
      .getAllByRole('listitem')
      .filter((item) => item.hasAttribute('data-about'))
      .map((item) => item.textContent)
    expect(before.length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: `Keep ${STARTS_ASKING.name}` }))

    const panel = document.querySelector('[data-formancy-part="scenario-list"]') as HTMLElement
    const entry = within(panel)
      .getAllByRole('listitem')
      .find((item) => item.querySelector('strong')?.textContent === STARTS_ASKING.name)
    expect(entry?.getAttribute('data-passed')).toBe('false')
    expect([...entry!.querySelectorAll('[data-about]')].map((item) => item.textContent)).toEqual(before)
  })

  test('lists the items that were not examples, with why, beside the ones that were', async () => {
    // One broken item does not cost the others, and is not silently dropped either.
    const user = userEvent.setup()
    const { ask } = model(drafting(HOLDS, { changes: {}, valid: true }))
    render(<ScenarioPane session={createBuilderSession(form)} scenarios={[]} onChange={() => undefined} ask={ask} />)

    await draft(user)

    expect(screen.getByText('Item 2 has no name.')).toBeTruthy()
    expect(screen.getByRole('button', { name: `Keep ${HOLDS.name}` })).toBeTruthy()
  })

  test('Keep and Discard take the draft away and the focus to the heading, rather than to the page', async () => {
    // The button pressed leaves with its draft; without somewhere to go, the focus falls to
    // <body> and a keyboard user starts again from the top of the page.
    const user = userEvent.setup()
    const { ask } = model(drafting(HOLDS, FAILS))
    render(<Host session={createBuilderSession(form)} ask={ask} />)

    await draft(user)
    await user.click(screen.getByRole('button', { name: `Discard ${FAILS.name}` }))

    expect(screen.queryByRole('button', { name: `Keep ${FAILS.name}` })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Draft examples with a model' }))
    await user.click(screen.getByRole('button', { name: `Keep ${HOLDS.name}` }))
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Draft examples with a model' }))
  })

  test('taken off the screen while a run waits, it stops the run and tells the host', async () => {
    // A relay holding a turn for a part nobody can see would refuse the next request.
    const user = userEvent.setup()
    const cancelled = vi.fn()
    const ask: AskModel = (_prompt, turn) => {
      turn.onCancel(cancelled)
      return new Promise<string>(() => undefined)
    }
    const view = render(
      <ScenarioPane session={createBuilderSession(form)} scenarios={[]} onChange={() => undefined} ask={ask} />,
    )
    await user.type(screen.getByRole('textbox', { name: /What should this form do/ }), 'anything')
    await user.click(screen.getByRole('button', { name: 'Draft examples' }))
    await screen.findByRole('button', { name: 'Stop drafting' })

    view.unmount()

    expect(cancelled).toHaveBeenCalledTimes(1)
  })

  test('Stop ends a run that is waiting, and the model’s late answer is not drafted', async () => {
    // A relay's turn the person walked away from must not turn into drafts later.
    const user = userEvent.setup()
    let answer: (text: string) => void = () => undefined
    const ask: AskModel = () => new Promise<string>((resolve) => (answer = resolve))
    render(<ScenarioPane session={createBuilderSession(form)} scenarios={[]} onChange={() => undefined} ask={ask} />)

    await user.type(screen.getByRole('textbox', { name: /What should this form do/ }), 'anything')
    await user.click(screen.getByRole('button', { name: 'Draft examples' }))
    await user.click(await screen.findByRole('button', { name: 'Stop drafting' }))
    answer(drafting(HOLDS))

    const statuses = await screen.findAllByRole('status')
    await waitFor(() =>
      expect(statuses.some((status) => status.textContent === 'Stopped. Nothing was drafted.')).toBe(true),
    )
    expect(screen.queryByRole('list', { name: 'Drafted examples' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Draft examples with a model' }))
  })
})
