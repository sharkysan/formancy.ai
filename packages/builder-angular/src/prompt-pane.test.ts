import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { render, screen, waitFor, within } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createBuilderSession, createPromptRun } from '@formancy/builder-core'
import type { AskModel, PromptRun } from '@formancy/builder-core'
import type { Scenario } from '@formancy/core'
import { DECLINE_KEY } from '@formancy/spec'
import type { FormSchema } from '@formancy/spec'
import { FormancyPromptPane } from './prompt-pane.js'

/**
 * The same assertions as packages/builder-react/src/prompt-pane.test.tsx.
 *
 * Written twice on purpose. Two renderers implementing one control by hand is
 * deliberate ([0033](../../../docs/decisions/0033-one-suite-n-drivers.md)); two
 * implementations of the same *decision* is what `@formancy/builder-core`
 * exists to prevent, and the decisions here — what counts as a change, when a
 * proposal has gone stale, whether an edit costs the answers already collected
 * — all live in that core and are tested there once
 * ([0109](../../../docs/decisions/0109-an-ai-edit-is-reviewed-before-it-lands.md)).
 *
 * What is written twice is the part a person touches: that the answer is
 * **shown** and not applied, that applying is explicit, and that a proposal
 * written against a form which has since moved is refused rather than silently
 * discarding somebody's edit.
 */
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

const START: FormSchema = {
  specVersion: '2',
  id: 'start',
  title: 'Start',
  model: { fields: [{ key: 'name', type: 'text', label: 'Name' }] },
}

const WRITTEN = {
  specVersion: '2',
  id: 'contact',
  title: 'Contact us',
  model: {
    fields: [
      { key: 'email', type: 'text', label: 'Email', format: 'email', required: true },
      { key: 'message', type: 'textarea', label: 'Message' },
    ],
  },
}

/** The starting form with a phone number added: an answer told apart from `WRITTEN`. */
const WITH_PHONE = {
  ...START,
  model: { fields: [...START.model.fields, { key: 'phone', type: 'text', label: 'Phone' }] },
}

const say = (...answers: string[]) => {
  let at = 0
  return vi.fn(() => Promise.resolve(answers[Math.min(at++, answers.length - 1)] ?? ''))
}

/**
 * A model that waits to be told what to say, and records whether it was told to stop.
 * `release` answers the latest turn, or the one named — the first of two runs, say.
 */
const held = () => {
  const releases: Array<(answer: string) => void> = []
  const cancelled = vi.fn()
  const model = vi.fn<AskModel>(
    (_prompt, turn) =>
      new Promise<string>((resolve) => {
        releases.push(resolve)
        turn.onCancel(cancelled)
      }),
  )
  return {
    model,
    cancelled,
    release: (answer: string, turn = releases.length - 1) => releases[turn]?.(answer),
  }
}

async function mount(
  session: ReturnType<typeof createBuilderSession>,
  ask?: AskModel,
  attempts?: number,
  run?: PromptRun,
) {
  return render(FormancyPromptPane, {
    // `componentInputs` would be the typed route; this component's inputs are
    // a session, a function and a number, and the helper is what keeps the
    // cases about the behaviour rather than about mounting.
    inputs: {
      session,
      ask,
      ...(attempts === undefined ? {} : { attempts }),
      ...(run === undefined ? {} : { run }),
    } as Record<string, unknown>,
    providers: [provideZonelessChangeDetection()],
  })
}

/** The pane taken off the screen, and the module freed for the next one to be drawn. */
const takeAway = (fixture: { destroy(): void }): void => {
  fixture.destroy()
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
}

const instruct = async (user: ReturnType<typeof userEvent.setup>, what: string): Promise<void> => {
  await user.type(screen.getByRole('textbox', { name: /Describe the form/ }), what)
  await user.click(screen.getByRole('button', { name: 'Write it' }))
}

describe('when nobody has configured a model', () => {
  test('the pane is not there at all', async () => {
    // Rather than a button that cannot work. A feature nobody has set up
    // should be absent, not broken.
    await mount(createBuilderSession(START))

    expect(screen.queryByRole('button', { name: 'Write it' })).toBeNull()
  })
})

describe('writing a form', () => {
  test('proposes it, and applies nothing until somebody says so', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    await mount(session, say(JSON.stringify(WRITTEN)))

    await instruct(user, 'a contact form')

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Review these changes/ })).toBeTruthy(),
    )
    expect(screen.getByRole('status').textContent).toContain('Nothing has been applied')
    expect(session.document()).toEqual(START)
    expect(session.revision()).toBe(0)
  })

  test('shows what the change actually does, and says when it costs answers', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    await mount(session, say(JSON.stringify(WRITTEN)))

    await instruct(user, 'a contact form')

    await waitFor(() => expect(screen.getByRole('heading', { name: /Review/ })).toBeTruthy())
    const listed = screen.getAllByRole('listitem').map((item) => item.textContent ?? '')
    // `name` goes and `email` arrives: the removal is the one that costs
    // something, and the review has to say so before anybody presses apply.
    expect(listed.some((entry) => entry.includes('name') && /orphaned/i.test(entry))).toBe(true)
    expect(screen.getByRole('heading', { name: /affect answers already collected/ })).toBeTruthy()
  })

  test('and applying it is one undoable step', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    await mount(session, say(JSON.stringify(WRITTEN)))

    await instruct(user, 'a contact form')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Apply these changes' })).toBeTruthy(),
    )
    await user.click(screen.getByRole('button', { name: 'Apply these changes' }))

    await waitFor(() => expect(session.document().id).toBe('contact'))
    session.undo()
    expect(session.document().id).toBe('start')
  })

  test('discarding one leaves no trace of it', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    await mount(session, say(JSON.stringify(WRITTEN)))

    await instruct(user, 'a contact form')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Discard' })).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Discard' }))

    await waitFor(() => expect(screen.queryByRole('heading', { name: /Review/ })).toBeNull())
    expect(session.document()).toEqual(START)
    expect(session.revision()).toBe(0)
  })

  test('one written against a form that has since moved is refused rather than applied', async () => {
    /*
     * The failure the review step would otherwise introduce. A model answers
     * with the WHOLE document, so applying a proposal made before somebody
     * added a field would silently discard that field.
     */
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    await mount(session, say(JSON.stringify(WRITTEN)))

    await instruct(user, 'a contact form')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Apply these changes' })).toBeTruthy(),
    )

    session.insertField({ parent: [], index: 0 }, { key: 'reference', type: 'text' })
    await user.click(screen.getByRole('button', { name: 'Apply these changes' }))

    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/changed since/i))
    expect(session.document().model.fields[0]?.key).toBe('reference')
    // Still on screen: the person needs it in order to ask again.
    expect(screen.getByRole('button', { name: 'Apply these changes' })).toBeTruthy()
  })
})

/**
 * A form with a rule somebody could write backwards, and the examples that pin it — the
 * React pane's fixture. `name` is required and no example sets it, so a pane that dropped
 * `initialValue` would run every example into `required`, before and after, and name nothing.
 */
const travel = (canton: string): FormSchema => ({
  specVersion: '2',
  id: 'travel',
  title: 'Travel',
  model: {
    fields: [
      { key: 'name', type: 'text', label: 'Name', required: true },
      { key: 'country', type: 'text', label: 'Country' },
      { key: 'canton', type: 'text', label: 'Canton' },
    ],
  },
  logic: { rules: [{ target: 'canton', kind: 'visible', cel: canton }] },
})
const RIGHT = travel('country == "CH"')
const BACKWARDS = travel('country != "CH"')
const SAMPLE = { name: 'Ada' }
const CANTON: Scenario = {
  name: 'Switzerland asks for a canton',
  changes: { country: 'CH' },
  valid: true,
  visible: { canton: true },
}

/** The pane with the form's examples bound, as a host binds the scenario pane's. */
async function mountWithExamples(
  session: ReturnType<typeof createBuilderSession>,
  ask: AskModel,
  mode?: 'client' | 'server',
) {
  return render(FormancyPromptPane, {
    inputs: {
      session,
      ask,
      scenarios: [CANTON],
      initialValue: SAMPLE,
      ...(mode === undefined ? {} : { mode }),
    } as Record<string, unknown>,
    providers: [provideZonelessChangeDetection()],
  })
}

describe('with the form’s examples', () => {
  test('the review names the example an answer would stop holding, and Apply is still there', async () => {
    /*
     * The failure this exists for (0159). The inverted rule passes every check `authorForm`
     * makes, so the review listed one changed rule — and the example that would have said
     * otherwise ran only after Apply, in the scenario pane. Apply stays: a rule changed on
     * purpose stops its old example holding, and the person decides.
     */
    const user = userEvent.setup()
    const session = createBuilderSession(RIGHT)
    await mountWithExamples(session, say(JSON.stringify(BACKWARDS)))

    await instruct(user, 'show the canton outside Switzerland too')

    await waitFor(() =>
      expect(
        screen.getByRole('region', { name: /would stop holding: Switzerland asks for a canton/ }),
      ).toBeTruthy(),
    )
    expect(screen.getByRole('status').textContent).toContain(
      'Would stop holding if applied: Switzerland asks for a canton.',
    )
    expect(session.document()).toEqual(RIGHT)
    const apply = screen.getByRole('button', { name: 'Apply these changes' }) as HTMLButtonElement
    expect(apply.disabled).toBe(false)
    await user.click(apply)
    expect(session.document()).toEqual(BACKWARDS)
  })

  test('and runs them in the mode it is given', async () => {
    /*
     * A check that runs only on the server is what the publish gate runs. A pane that
     * dropped `mode` would run the client, call the edit harmless, and the first anybody
     * heard of it would be a submission refused.
     */
    const user = userEvent.setup()
    const strict = travel('country == "CH"')
    strict.logic!.rules.push({
      target: 'name',
      kind: 'validate',
      cel: 'size(name) > 3',
      code: 'tooShort',
      runsOn: 'server',
    })
    await mountWithExamples(createBuilderSession(RIGHT), say(JSON.stringify(strict)), 'server')

    await instruct(user, 'names longer than three letters, checked on the server')

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'Would stop holding if applied: Switzerland asks for a canton.',
      ),
    )
  })

  test('without them the review is what it was', async () => {
    // A host that binds no examples gets no sentence about them, rather than one saying
    // nothing would stop holding for a check that never ran.
    const user = userEvent.setup()
    await mount(createBuilderSession(RIGHT), say(JSON.stringify(BACKWARDS)))

    await instruct(user, 'show the canton outside Switzerland too')

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Review these changes/ })).toBeTruthy(),
    )
    expect(screen.getByRole('status').textContent).not.toMatch(/holding/)
  })
})

describe('when it cannot', () => {
  test('nothing is proposed, and the document is untouched', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    await mount(session, say('nonsense'), 2)

    await instruct(user, 'a contact form')

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Nothing was applied'),
    )
    expect(screen.queryByRole('heading', { name: /Review/ })).toBeNull()
    expect(session.document()).toEqual(START)
  })

  test('a model that cannot be reached is said to be that, not a document that failed', async () => {
    /*
     * The pane caught the rejection and built a failure with `attempts: 0`, and
     * the status read "0 attempts, and the document still did not work" — so a
     * person reworded an instruction that never reached a model.
     */
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    await mount(session, () => Promise.reject(new Error('fetch failed')))

    await instruct(user, 'a contact form')

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'Nothing was applied. The model could not be reached: fetch failed',
      ),
    )
    // Nothing was wrong with an answer, because there was none: no problem list. The
    // list itself, not its items — an empty one is still announced as a list.
    expect(screen.queryByRole('list')).toBeNull()
  })

  test('a model that throws is reported rather than swallowed', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(START)

    await mount(session, vi.fn(() => Promise.reject(new Error('429 rate limited'))))
    await instruct(user, 'a contact form')

    // A network failure, a rate limit, a missing key. A button that silently
    // does nothing is the worst version of this.
    await waitFor(() => expect(screen.getByText(/429 rate limited/)).toBeTruthy())
  })
})

describe('when the model declines', () => {
  test('it says so after one turn, and shows the model’s reason, as text, in place of the problems', async () => {
    /*
     * Asked for something the format cannot express, a model had no answer but a
     * document. It wrote one that failed on every attempt, and the pane listed what
     * the checks said about a document nobody wanted, and nothing of why. The reason
     * is the model's text: shown as written, never as markup.
     */
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    const why = 'A form cannot send <b>email</b>. That is set up on the server.'
    const model = say('not json at all', JSON.stringify({ [DECLINE_KEY]: why }))
    await mount(session, model)

    await instruct(user, 'email me every submission')

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'Nothing was applied. The model declined this request.',
      ),
    )
    expect(screen.getByText(why)).toBeTruthy()
    expect(document.querySelector('[data-formancy-part="prompt-pane"] b')).toBeNull()
    // In place of the problem list: the first answer's complaint was about a
    // document, and there is no document to fix. The list itself, not its items.
    expect(screen.queryByRole('list')).toBeNull()
    expect(model).toHaveBeenCalledTimes(2)
    expect(session.document()).toEqual(START)
  })
})

describe('while it is working', () => {
  test('can be stopped, and an answer that arrives afterwards is never proposed', async () => {
    /*
     * Nothing could stop a run: a slow model held the pane busy for as long as
     * it liked. And the answer to an instruction somebody has walked away from
     * must not turn up later as a proposal, where it reads as the answer to
     * whatever they asked next.
     */
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    const slow = held()
    await mount(session, slow.model)

    await instruct(user, 'a contact form')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Stop' }))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Stopped. Nothing was applied.'),
    )
    // The host was told, so it can abandon the request rather than pay for it.
    expect(slow.cancelled).toHaveBeenCalledTimes(1)
    // No answer came, so there is nothing wrong with one to list.
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Write it' }).disabled).toBe(false)

    slow.release(JSON.stringify(WRITTEN))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByRole('heading', { name: /Review/ })).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Stopped. Nothing was applied.')
    expect(session.document()).toEqual(START)
  })

  test('an answer to a stopped run, arriving while the next one waits, is not taken for its answer', async () => {
    /*
     * The variant SAFETY-ANALYSIS D10 names: somebody stops, asks for something
     * else, and the first model answers late. The case above releases that answer
     * while the pane is idle, which a pane dropping answers only when idle passes
     * too — as does one holding a single stop for its whole life, whose second run
     * would end before it asked. Here it arrives during the second run.
     */
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    const slow = held()
    await mount(session, slow.model)

    await instruct(user, 'a contact form')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() =>
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Write it' }).disabled).toBe(false),
    )
    await user.clear(screen.getByRole('textbox', { name: /Describe the form/ }))
    await instruct(user, 'only a phone number')
    await waitFor(() => expect(slow.model).toHaveBeenCalledTimes(2))

    slow.release(JSON.stringify(WRITTEN), 0)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByRole('heading', { name: /Review/ })).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Writing the form, and checking it.')

    slow.release(JSON.stringify(WITH_PHONE), 1)
    const review = await screen.findByRole('region', { name: /Review/ })
    expect(review.textContent).toContain('phone')
    expect(review.textContent).not.toContain('email')
  })

  test('hands focus back to Write when Stop is pressed, rather than dropping it on the page', async () => {
    /*
     * Stop is drawn only while a run waits, so pressing it removes the focused
     * button and focus fell to <body>: the next Tab started from the top of the
     * page. Write is where the run began, and enabled again by then.
     */
    const user = userEvent.setup()
    const slow = held()
    await mount(createBuilderSession(START), slow.model)

    await instruct(user, 'a contact form')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Stop' }))

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Write it' })),
    )
  })

  test('and when the run ends by itself while Stop has focus', async () => {
    // The same button leaves the same way when the answer arrives first.
    const user = userEvent.setup()
    const slow = held()
    await mount(createBuilderSession(START), slow.model)

    await instruct(user, 'a contact form')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy())
    screen.getByRole('button', { name: 'Stop' }).focus()
    slow.release(JSON.stringify(WRITTEN))

    await screen.findByRole('region', { name: /Review/ })
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Write it' })),
    )
  })

  test('a pane that is destroyed stops its run', async () => {
    // Otherwise the host's request runs on for an answer nothing will show —
    // a builder closed mid-run, or the pane swapped for another.
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    const slow = held()
    const { fixture } = await mount(session, slow.model)

    await instruct(user, 'a contact form')
    await waitFor(() => expect(slow.model).toHaveBeenCalled())
    fixture.destroy()

    expect(slow.cancelled).toHaveBeenCalledTimes(1)
  })

  test('offers no stop when there is nothing to stop', async () => {
    await mount(createBuilderSession(START), say(JSON.stringify(WRITTEN)))

    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
  })
})

/**
 * A run the host holds ([0163](../../../docs/decisions/0163-a-models-run-belongs-to-the-host.md)).
 *
 * The same cases as the React pane's. A run was the pane's, and a destroyed pane stopped
 * it (0157); bound to `[run]`, the pane draws a run the host holds and leaves it running
 * when it goes. Bound to `[ask]` alone it holds its own, as it always did — the case above.
 */
describe('when the host holds the run', () => {
  test('a pane that is destroyed leaves the run waiting, and the pane drawn next shows its answer', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    const slow = held()
    const run = createPromptRun()
    const { fixture } = await mount(session, slow.model, undefined, run)

    await instruct(user, 'add a phone number')
    await waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))
    takeAway(fixture)

    expect(slow.cancelled).not.toHaveBeenCalled()
    slow.release(JSON.stringify(WITH_PHONE))
    await waitFor(() => expect(run.state().proposal).toBeDefined())

    await mount(session, slow.model, undefined, run)
    const review = await screen.findByRole('region', { name: /Review/ })
    expect(review.textContent).toContain('phone')
    // Beside the words it answers, which this pane never saw typed.
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: /Describe the form/ }).value).toBe(
      'add a phone number',
    )
    await user.click(within(review).getByRole('button', { name: 'Apply these changes' }))
    expect(session.document().model.fields.map((field) => field.key)).toEqual(['name', 'phone'])
  })

  test('a proposal held for review is still held after the pane goes and comes back', async () => {
    // Destroyed and drawn again — another tab and back — with the review open: the pane's
    // own state went with it, and the answer had to be asked for again.
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    const run = createPromptRun()
    const { fixture } = await mount(session, say(JSON.stringify(WITH_PHONE)), undefined, run)
    await instruct(user, 'add a phone number')
    await screen.findByRole('region', { name: /Review/ })
    takeAway(fixture)

    await mount(session, say(JSON.stringify(WITH_PHONE)), undefined, run)

    expect((await screen.findByRole('region', { name: /Review/ })).textContent).toContain('phone')
    expect(screen.getByRole('status').textContent).toContain('Nothing has been applied')
    expect(session.revision()).toBe(0)
  })

  test('a review names the words it answers, whatever the box says since', async () => {
    // Once the run has answered, the box is the person's again. A review read beside the box
    // alone — after typing the next instruction, or in the other builder over the same run —
    // would be read as the answer to words it never saw (SAFETY-ANALYSIS D10).
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    await mount(session, say(JSON.stringify(WITH_PHONE)), undefined, createPromptRun())
    await instruct(user, 'add a phone number')
    const review = await screen.findByRole('region', { name: /Review/ })

    const box = screen.getByRole('textbox', { name: /Describe the form/ })
    await user.clear(box)
    await user.type(box, 'add a fax number')
    expect((box as HTMLTextAreaElement).value).toBe('add a fax number')

    await waitFor(() => expect(within(review).getByText('In answer to “add a phone number”')).toBeTruthy())
    expect(review.textContent).not.toContain('fax')
  })

  test('a run still waiting is drawn waiting, and Stop there ends it', async () => {
    // The pane drawn next is the one with the Stop button now: one that showed the run idle
    // would offer Write over a turn still with the person, and could not stop it.
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    const slow = held()
    const run = createPromptRun()
    const { fixture } = await mount(session, slow.model, undefined, run)
    await instruct(user, 'add a phone number')
    await waitFor(() => expect(slow.model).toHaveBeenCalledTimes(1))
    takeAway(fixture)
    // Long enough for a run the destroy had stopped to have said so.
    await new Promise((resolve) => setTimeout(resolve, 10))

    await mount(session, slow.model, undefined, run)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Writing/ }).disabled).toBe(true)
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: /Describe the form/ }).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Stop' }))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Stopped. Nothing was applied.'),
    )
    expect(slow.cancelled).toHaveBeenCalledTimes(1)
  })

  test('two panes showing one run are one run: Stop in either ends it for both', async () => {
    // A host may draw the pane twice — the playground's two builders over one session
    // (0096). Two runs would be two turns for one instruction, and a Stop that ended only
    // its own pane's would leave the other's request running.
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    const slow = held()
    const run = createPromptRun()
    await render(
      `<section aria-label="first"><formancy-prompt-pane [session]="session" [ask]="ask" [run]="run" /></section>
       <section aria-label="second"><formancy-prompt-pane [session]="session" [ask]="ask" [run]="run" /></section>`,
      {
        imports: [FormancyPromptPane],
        componentProperties: { session, ask: slow.model, run },
        providers: [provideZonelessChangeDetection()],
      },
    )
    const first = within(screen.getByRole('region', { name: 'first' }))
    const second = within(screen.getByRole('region', { name: 'second' }))

    await user.type(first.getByRole('textbox', { name: /Describe the form/ }), 'add a phone number')
    await waitFor(() =>
      expect(second.getByRole<HTMLTextAreaElement>('textbox', { name: /Describe the form/ }).value).toBe(
        'add a phone number',
      ),
    )
    await user.click(first.getByRole('button', { name: 'Write it' }))
    await user.click(await second.findByRole('button', { name: 'Stop' }))

    await waitFor(() =>
      expect(first.getByRole('status').textContent).toBe('Stopped. Nothing was applied.'),
    )
    expect(second.getByRole('status').textContent).toBe('Stopped. Nothing was applied.')
    expect(slow.model).toHaveBeenCalledTimes(1)
    expect(slow.cancelled).toHaveBeenCalledTimes(1)
  })
})
