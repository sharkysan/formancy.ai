import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { render, screen, waitFor, within } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createBuilderSession } from '@formancy/builder-core'
import type { AskModel } from '@formancy/builder-core'
import type { Scenario } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyScenarioPane } from './scenario-pane.js'

/**
 * The same assertions as packages/builder-react/src/scenario-drafts.test.tsx.
 *
 * What the model is shown, how its answer is read and what may be kept are
 * `@formancy/builder-core`'s and tested there. What is held here is what the Angular part
 * does with them: that nothing is emitted until Keep, that a draft that fails can be kept,
 * that one which cannot is refused out loud, and that a draft's verdict follows the form
 * and is the one the list gives it once kept
 * ([0162](../../../docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).
 */
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

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
const HOLDS: Scenario = {
  name: 'other asks why',
  changes: { kind: 'other' },
  valid: true,
  visible: { reason: true },
}
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
/** `form` with a check that runs on the server alone: the one the publish gate runs. */
const serverChecked = (): FormSchema => {
  const next = JSON.parse(JSON.stringify(form)) as FormSchema
  next.logic!.rules.push({ target: 'reason', kind: 'validate', cel: "reason != 'no'", runsOn: 'server' })
  return next
}
/** Holds on the client, and fails on the server: what it says depends on the mode. */
const SAYS_NO: Scenario = {
  name: 'no is a reason',
  changes: { kind: 'other', reason: 'no' },
  valid: true,
}

const answering =
  (answer: string): AskModel =>
  () =>
    Promise.resolve(answer)
const drafting = (...items: unknown[]): string => JSON.stringify({ scenarios: items })

async function mount(
  inputs: Record<string, unknown>,
  changed: (next: readonly Scenario[]) => void = () => undefined,
) {
  return render(FormancyScenarioPane, {
    inputs: { removable: true, ...inputs } as Record<string, unknown>,
    on: { scenariosChange: changed },
    providers: [provideZonelessChangeDetection()],
  })
}

/** Type what the form should do and press Draft; resolves once the drafts are listed. */
async function draft(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.type(screen.getByRole('textbox', { name: /What should this form do/ }), 'Only other asks why.')
  await user.click(screen.getByRole('button', { name: 'Draft examples' }))
  return screen.findByRole('list', { name: 'Drafted examples' })
}

describe('drafting', () => {
  test('is not drawn without a model, or without the buttons the host asks for', async () => {
    // A Keep whose output nobody listens to is worse than no Keep, and a Draft button with
    // no model behind it is a button that cannot work.
    await render(FormancyScenarioPane, {
      inputs: {
        session: createBuilderSession(form),
        scenarios: [],
        ask: answering(drafting(HOLDS)),
      } as Record<string, unknown>,
      providers: [provideZonelessChangeDetection()],
    })
    expect(screen.queryByRole('button', { name: 'Draft examples' })).toBeNull()
    TestBed.resetTestingModule()
    document.body.innerHTML = ''
    await mount({ session: createBuilderSession(form), scenarios: [] })
    expect(screen.queryByRole('button', { name: 'Draft examples' })).toBeNull()
  })

  test('nothing is emitted until Keep, and Keep emits the list with the draft added', async () => {
    // A draft is a model's guess at what the author meant. Added to the host's list on
    // arrival, it would be checking the form before anybody had read it.
    const user = userEvent.setup()
    const changed = vi.fn()
    await mount({ session: createBuilderSession(form), scenarios: [EXISTING], ask: answering(drafting(HOLDS, FAILS)) }, changed)

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
    await mount({ session: createBuilderSession(form), scenarios: [], ask: answering(drafting(FAILS)) }, changed)

    const list = await draft(user)
    expect(within(list).getByText(/Does not hold against the form as it is/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: `Keep ${FAILS.name}` }))

    expect(changed).toHaveBeenCalledWith([FAILS])
  })

  test('a draft naming a field the form does not have is not kept, and the status says why', async () => {
    // It would check nothing, forever, and read as a check.
    const user = userEvent.setup()
    const changed = vi.fn()
    await mount({ session: createBuilderSession(form), scenarios: [], ask: answering(drafting(GHOST)) }, changed)

    await draft(user)
    await user.click(screen.getByRole('button', { name: `Keep ${GHOST.name}` }))

    expect(changed).not.toHaveBeenCalled()
    await waitFor(() => {
      const statuses = screen.getAllByRole('status').map((status) => status.textContent ?? '')
      expect(statuses.some((said) => said.includes(`Not kept: ${GHOST.name} names a field`))).toBe(true)
    })
  })

  test('a draft’s verdict follows the form, rather than being the one it arrived with', async () => {
    // A verdict stored on arrival would go on saying "holds" about a rule somebody has
    // since turned round.
    const user = userEvent.setup()
    const session = createBuilderSession(form)
    await mount({ session, scenarios: [], ask: answering(drafting(HOLDS)) })

    const list = await draft(user)
    expect(within(list).getByText('Holds against the form as it is.')).toBeTruthy()

    session.replaceDocument(inverted())

    await waitFor(() => expect(within(list).getByText(/Does not hold against the form as it is/)).toBeTruthy())
  })

  test.each([
    { with: 'sample', document: form, example: STARTS_ASKING, given: { initialValue: SAMPLE } },
    { with: 'mode', document: serverChecked(), example: SAYS_NO, given: { mode: 'server' } },
  ])('and is the verdict the list gives it once kept, with the pane’s $with', async (one) => {
    /*
     * The draft is run alone, the list as a whole; both with the pane's own sample and
     * mode. If they ran differently, somebody would keep an example on one verdict and
     * read another in the list. Each example here fails only with what the pane is given:
     * from the sample, or on the server, where a host's publish gate runs it — so a part
     * that dropped either, or a pane that did not bind it, would show it holding, and the
     * list would then say it does not. The host holds the list, so what is kept comes back in.
     */
    const user = userEvent.setup()
    const { fixture } = await mount(
      {
        session: createBuilderSession(one.document),
        scenarios: [EXISTING],
        ...one.given,
        ask: answering(drafting(one.example)),
      },
      (next) => fixture.componentRef.setInput('scenarios', next),
    )

    const list = await draft(user)
    const before = within(list)
      .getAllByRole('listitem')
      .filter((item) => item.hasAttribute('data-about'))
      .map((item) => item.textContent)
    expect(before.length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: `Keep ${one.example.name}` }))

    await waitFor(() => {
      const panel = document.querySelector('[data-formancy-part="scenario-list"]') as HTMLElement
      const entry = within(panel)
        .getAllByRole('listitem')
        .find((item) => item.querySelector('strong')?.textContent === one.example.name)
      expect(entry?.getAttribute('data-passed')).toBe('false')
      expect([...entry!.querySelectorAll('[data-about]')].map((item) => item.textContent)).toEqual(before)
    })
  })

  test('lists the items that were not examples, with why, beside the ones that were', async () => {
    // One broken item does not cost the others, and is not silently dropped either.
    const user = userEvent.setup()
    await mount({ session: createBuilderSession(form), scenarios: [], ask: answering(drafting(HOLDS, { changes: {}, valid: true })) })

    await draft(user)

    expect(screen.getByText('Item 2 has no name.')).toBeTruthy()
    expect(screen.getByRole('button', { name: `Keep ${HOLDS.name}` })).toBeTruthy()
  })

  test('Keep and Discard take the draft away and the focus to the heading, rather than to the page', async () => {
    // The button pressed leaves with its draft; without somewhere to go, the focus falls to
    // <body> and a keyboard user starts again from the top of the page.
    const user = userEvent.setup()
    await mount({ session: createBuilderSession(form), scenarios: [], ask: answering(drafting(HOLDS, FAILS)) })

    await draft(user)
    await user.click(screen.getByRole('button', { name: `Discard ${FAILS.name}` }))

    await waitFor(() => expect(screen.queryByRole('button', { name: `Keep ${FAILS.name}` })).toBeNull())
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Draft examples with a model' }))
    await user.click(screen.getByRole('button', { name: `Keep ${HOLDS.name}` }))
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Draft examples with a model' }))
  })

  test('destroyed while a run waits, it stops the run and tells the host, and does nothing after', async () => {
    // A relay holding a turn for a part nobody can see would refuse the next request; and a
    // run that ended into a destroyed part used to schedule a render on it, which throws.
    const user = userEvent.setup()
    const cancelled = vi.fn()
    const ask: AskModel = (_prompt, turn) => {
      turn.onCancel(cancelled)
      return new Promise<string>(() => undefined)
    }
    const { fixture } = await mount({ session: createBuilderSession(form), scenarios: [], ask })
    await user.type(screen.getByRole('textbox', { name: /What should this form do/ }), 'anything')
    await user.click(screen.getByRole('button', { name: 'Draft examples' }))
    await screen.findByRole('button', { name: 'Stop drafting' })

    fixture.destroy()
    await new Promise((settle) => setTimeout(settle, 50))

    expect(cancelled).toHaveBeenCalledTimes(1)
  })

  test('another session is another form: its drafts are not offered, and a run for the last one is stopped', async () => {
    // A host that keeps the pane on screen and opens another document would otherwise offer
    // the last form's drafts for keeping into the new form's list, and leave a relay holding
    // a turn about a form nobody is looking at. An input can be replaced (view.ts).
    const user = userEvent.setup()
    const cancelled = vi.fn()
    let calls = 0
    const ask: AskModel = (_prompt, turn) => {
      calls += 1
      if (calls === 1) return Promise.resolve(drafting(HOLDS))
      turn.onCancel(cancelled)
      return new Promise<string>(() => undefined)
    }
    const { fixture } = await mount({ session: createBuilderSession(form), scenarios: [], ask })
    await draft(user)

    fixture.componentRef.setInput('session', createBuilderSession(form))
    await fixture.whenStable()
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Drafted examples' })).toBeNull())

    await user.click(screen.getByRole('button', { name: 'Draft examples' }))
    await screen.findByRole('button', { name: 'Stop drafting' })
    fixture.componentRef.setInput('session', createBuilderSession(form))
    await fixture.whenStable()

    await waitFor(() => expect(cancelled).toHaveBeenCalledTimes(1))
  })

  test('Stop ends a run that is waiting, and the model’s late answer is not drafted', async () => {
    // A relay's turn the person walked away from must not turn into drafts later.
    const user = userEvent.setup()
    let answer: (text: string) => void = () => undefined
    const ask: AskModel = () => new Promise<string>((resolve) => (answer = resolve))
    await mount({ session: createBuilderSession(form), scenarios: [], ask })

    await user.type(screen.getByRole('textbox', { name: /What should this form do/ }), 'anything')
    await user.click(screen.getByRole('button', { name: 'Draft examples' }))
    await user.click(await screen.findByRole('button', { name: 'Stop drafting' }))
    answer(drafting(HOLDS))

    await waitFor(() =>
      expect(
        screen.getAllByRole('status').some((status) => status.textContent === 'Stopped. Nothing was drafted.'),
      ).toBe(true),
    )
    expect(screen.queryByRole('list', { name: 'Drafted examples' })).toBeNull()
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Draft examples with a model' })),
    )
  })
})
