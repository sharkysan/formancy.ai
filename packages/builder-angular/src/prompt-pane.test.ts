import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { render, screen, waitFor } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createBuilderSession } from '@formancy/builder-core'
import type { AskModel } from '@formancy/builder-core'
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
) {
  return render(FormancyPromptPane, {
    // `componentInputs` would be the typed route; this component's inputs are
    // a session, a function and a number, and the helper is what keeps the
    // cases about the behaviour rather than about mounting.
    inputs: { session, ask, ...(attempts === undefined ? {} : { attempts }) } as Record<string, unknown>,
    providers: [provideZonelessChangeDetection()],
  })
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
