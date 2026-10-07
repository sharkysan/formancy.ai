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

const say = (...answers: string[]) => {
  let at = 0
  return vi.fn(() => Promise.resolve(answers[Math.min(at++, answers.length - 1)] ?? ''))
}

async function mount(
  session: ReturnType<typeof createBuilderSession>,
  ask?: AskModel,
  attempts?: number,
): Promise<void> {
  await render(FormancyPromptPane, {
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
