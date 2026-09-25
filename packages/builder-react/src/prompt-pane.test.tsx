import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createBuilderSession } from '@formancy/builder-core'
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
  test('applies it, and says so out loud', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    render(<PromptPane session={session} ask={say(JSON.stringify(WRITTEN))} />)

    await ask(user, 'a contact form')

    await waitFor(() => expect(session.document().id).toBe('contact'))
    // Announced, not just drawn: the work takes seconds and a spinner tells a
    // screen-reader user nothing about what came of it.
    expect(screen.getByRole('status').textContent).toContain('valid')
  })

  test('as ONE undoable step', async () => {
    const user = userEvent.setup()
    const session = createBuilderSession(START)
    render(<PromptPane session={session} ask={say(JSON.stringify(WRITTEN))} />)

    await ask(user, 'a contact form')
    await waitFor(() => expect(session.document().id).toBe('contact'))

    session.undo()

    // The only behaviour anybody would expect of a button like this.
    expect(session.document().id).toBe('start')
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
    expect(session.document().id).toBe('contact')
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
    await waitFor(() => expect(session.document().id).toBe('contact'))
    expect(slow).toHaveBeenCalledTimes(1)
  })

  test('an empty instruction is not sent', async () => {
    const session = createBuilderSession(START)
    const model = say(JSON.stringify(WRITTEN))
    render(<PromptPane session={session} ask={model} />)

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Write it' }).disabled).toBe(true)
    expect(model).not.toHaveBeenCalled()
  })
})
