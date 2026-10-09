import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createBuilderSession } from '@formancy/builder-core'
import type { AskModel } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { PromptPane } from './prompt-pane.js'

/**
 * The pane, with a scripted model.
 *
 * The model is a function the host supplies, so a test supplies one too — no
 * vendor, no key, no network. What is being pinned is the property the whole
 * feature rests on: **nothing reaches the document unless it would work**.
 * Everything else here is about failing usefully.
 */
afterEach(cleanup)

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

const say = (...answers: string[]) => {
  let at = 0
  return vi.fn(() => Promise.resolve(answers[Math.min(at++, answers.length - 1)] ?? ''))
}

/** A model that waits to be told what to say, and records whether it was told to stop. */
const held = () => {
  let release: (answer: string) => void = () => undefined
  const cancelled = vi.fn()
  const model = vi.fn<AskModel>(
    (_prompt, turn) =>
      new Promise<string>((resolve) => {
        release = resolve
        turn.onCancel(cancelled)
      }),
  )
  return { model, cancelled, release: (answer: string) => release(answer) }
}

const ask = async (user: ReturnType<typeof userEvent.setup>, what: string): Promise<void> => {
  await user.type(screen.getByRole('textbox', { name: /Describe the form/ }), what)
  await user.click(screen.getByRole('button', { name: 'Write it' }))
}

describe('when nobody has configured a model', () => {
  test('the pane is not there at all', () => {
    const session = createBuilderSession(START)

    const { container } = render(<PromptPane session={session} />)

    // Rather than a button that cannot work. A feature nobody has set up
    // should be absent, not broken.
    expect(container.innerHTML).toBe('')
  })
})

describe('writing a form', () => {
  test('proposes it, and applies nothing until somebody says so', async () => {
    /*
     * The property this pane now rests on. It used to apply the answer and
     * offer undo, and undo is the wrong shape: it puts a document back after
     * the change has been read, previewed and — in a shared session —
     * published by somebody else.
     */
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    render(<PromptPane session={session} ask={say(JSON.stringify(WRITTEN))} />)

    await ask(user, 'a contact form')

    await waitFor(() => expect(screen.getByRole('heading', { name: /Review these changes/ })).toBeTruthy())
    // Announced, not just drawn: the work takes seconds and a spinner tells a
    // screen-reader user nothing about what came of it.
    expect(screen.getByRole('status').textContent).toContain('Nothing has been applied')
    expect(session.document()).toEqual(START)
    expect(session.revision()).toBe(0)
  })

  test('shows what the change actually does, from the same diff everything else reads', async () => {
    // Not a second opinion about what changed. The publish check, draft
    // migration and the consumer CI gate read `diffSchemas`, and so does this.
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    render(<PromptPane session={session} ask={say(JSON.stringify(WRITTEN))} />)

    await ask(user, 'a contact form')

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
    render(<PromptPane session={session} ask={say(JSON.stringify(WRITTEN))} />)

    await ask(user, 'a contact form')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply these changes' })).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Apply these changes' }))

    await waitFor(() => expect(session.document().id).toBe('contact'))
    session.undo()
    expect(session.document().id).toBe('start')
  })

  test('discarding one leaves no trace of it', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    render(<PromptPane session={session} ask={say(JSON.stringify(WRITTEN))} />)

    await ask(user, 'a contact form')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Discard' })).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Discard' }))

    expect(screen.queryByRole('heading', { name: /Review/ })).toBeNull()
    expect(session.document()).toEqual(START)
    expect(session.revision()).toBe(0)
  })

  test('one written against a form that has since moved is refused rather than applied', async () => {
    /*
     * The failure the review step would otherwise introduce. A model answers
     * with the WHOLE document, so applying a proposal made before somebody
     * added a field would silently discard that field. Refused rather than
     * merged: there is no three-way merge here, and inventing one would be
     * guessing at which edit wins.
     */
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    render(<PromptPane session={session} ask={say(JSON.stringify(WRITTEN))} />)

    await ask(user, 'a contact form')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply these changes' })).toBeTruthy())

    // Somebody edits the form while the proposal sits on screen.
    session.insertField({ parent: [], index: 0 }, { key: 'reference', type: 'text' })
    await user.click(screen.getByRole('button', { name: 'Apply these changes' }))

    expect(screen.getByRole('status').textContent).toMatch(/changed since/i)
    expect(session.document().model.fields[0]?.key).toBe('reference')
    // Still on screen: the person needs it in order to ask again.
    expect(screen.getByRole('button', { name: 'Apply these changes' })).toBeTruthy()
  })

  test('the model is told what is already there, so a change is a change', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    const model = say(JSON.stringify(WRITTEN))
    render(<PromptPane session={session} ask={model} />)

    await ask(user, 'add a phone number')

    await waitFor(() => expect(model).toHaveBeenCalled())
    const prompt = (model.mock.calls as unknown as { user: string }[][])[0]?.[0]
    expect(prompt?.user).toContain('current document')
    expect(prompt?.user).toContain('"start"')
  })

  test('a document that needed two goes says how many it took', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    render(
      <PromptPane
        session={session}
        ask={say('not json at all', JSON.stringify(WRITTEN))}
      />,
    )

    await ask(user, 'a contact form')

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('2 attempts'))
    // Still only proposed. The count is worth saying because a model that
    // needed correcting is one worth reading more carefully.
    expect(session.document()).toEqual(START)
  })
})

describe('when it cannot', () => {
  test('nothing is applied, and the document is untouched', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    render(<PromptPane session={session} ask={say('nonsense')} attempts={2} />)

    await ask(user, 'a contact form')

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Nothing was applied'))
    // The property the whole feature rests on. There is deliberately no third
    // outcome where something plausible lands in the editor.
    expect(session.document()).toEqual(START)
  })

  test('it says what was wrong, not that something was wrong', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    render(
      <PromptPane
        session={session}
        ask={say(JSON.stringify({ specVersion: '2', id: 'x' }))}
        attempts={1}
      />,
    )

    await ask(user, 'a contact form')

    // The person reading this can usually fix it by rewording one sentence.
    await waitFor(() => expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0))
  })

  test('and shows what the model actually said', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    render(<PromptPane session={session} ask={say('I am afraid I cannot')} attempts={1} />)

    await ask(user, 'a contact form')

    await waitFor(() => expect(screen.getByText('What the model last answered')).toBeTruthy())
    expect(screen.getByText('I am afraid I cannot')).toBeTruthy()
  })

  test('a model that cannot be reached is said to be that, not a document that failed', async () => {
    /*
     * The pane caught the rejection and built a failure with `attempts: 0`, and
     * the status read "0 attempts, and the document still did not work" — so a
     * person reworded an instruction that never reached a model.
     */
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    render(<PromptPane session={session} ask={() => Promise.reject(new Error('fetch failed'))} />)

    await ask(user, 'a contact form')

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'Nothing was applied. The model could not be reached: fetch failed',
      ),
    )
    // Nothing was wrong with an answer, because there was none: no problem list.
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  test('a model that throws is reported rather than swallowed', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    const broken = vi.fn(() => Promise.reject(new Error('429 rate limited')))

    render(<PromptPane session={session} ask={broken} />)
    await ask(user, 'a contact form')

    // A network failure, a rate limit, a missing key. A button that silently
    // does nothing is the worst version of this.
    await waitFor(() => expect(screen.getByText(/429 rate limited/)).toBeTruthy())
  })
})

describe('while it is working', () => {
  test('the button says so and cannot be pressed twice', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    let release: (answer: string) => void = () => undefined
    const slow = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve
        }),
    )

    render(<PromptPane session={session} ask={slow} />)
    await ask(user, 'a contact form')

    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Writing/ }).disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toContain('checking it')

    release(JSON.stringify(WRITTEN))
    await waitFor(() => expect(screen.getByRole('heading', { name: /Review/ })).toBeTruthy())
    expect(slow).toHaveBeenCalledTimes(1)
  })

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
    render(<PromptPane session={session} ask={slow.model} />)

    await ask(user, 'a contact form')
    await user.click(screen.getByRole('button', { name: 'Stop' }))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Stopped. Nothing was applied.'),
    )
    // The host was told, so it can abandon the request rather than pay for it.
    expect(slow.cancelled).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Write it' }).disabled).toBe(false)

    slow.release(JSON.stringify(WRITTEN))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByRole('heading', { name: /Review/ })).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Stopped. Nothing was applied.')
    expect(session.document()).toEqual(START)
  })

  test('a pane taken off the screen stops its run', async () => {
    // Otherwise the host's request runs on for an answer nothing will show —
    // a builder closed mid-run, or the pane swapped for another.
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    const slow = held()
    const { unmount } = render(<PromptPane session={session} ask={slow.model} />)

    await ask(user, 'a contact form')
    unmount()

    expect(slow.cancelled).toHaveBeenCalledTimes(1)
  })

  test('offers no stop when there is nothing to stop', () => {
    const session = createBuilderSession(START)
    render(<PromptPane session={session} ask={say(JSON.stringify(WRITTEN))} />)

    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
  })

  test('an empty instruction is not sent', async () => {
    const session = createBuilderSession(START)
    const model = say(JSON.stringify(WRITTEN))
    render(<PromptPane session={session} ask={model} />)

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Write it' }).disabled).toBe(true)
    expect(model).not.toHaveBeenCalled()
  })
})
