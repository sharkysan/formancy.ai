import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { authorForm, createBuilderSession, createRelay, createStop } from '@formancy/builder-core'
import type { AuthoringResult, Relay, Stop } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { RelayPane } from './relay-pane.js'

/**
 * The pane a person carries a model's turn through: the request copied out, the answer
 * pasted back ([0159](../../../docs/decisions/0159-a-person-carries-the-models-turn.md)).
 *
 * When a paste counts, and what a stop does to a turn, are `@formancy/builder-core`'s and
 * tested there once. What is pinned here is the part a person touches: what Copy puts on
 * the clipboard, what happens when the browser will not let it, and that the pane links
 * to a chat only when its host names one. `packages/builder-angular/src/relay-pane.test.ts`
 * holds the Angular pane to the same.
 */
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const START: FormSchema = {
  specVersion: '2',
  id: 'start',
  title: 'Start',
  model: { fields: [{ key: 'name', type: 'text', label: 'Name' }] },
}

const WITH_PHONE = JSON.stringify({
  ...START,
  model: { fields: [...START.model.fields, { key: 'phone', type: 'text', label: 'Phone' }] },
})

/**
 * Start a run on the relay, as a prompt pane would, and wait for the pane to show its turn.
 *
 * The run comes back inside an object: an async function returning a promise resolves
 * with what THAT promise resolves to, and this run waits for a paste nobody has made.
 */
async function start(relay: Relay, stop?: Stop): Promise<{ run: Promise<AuthoringResult> }> {
  let run: Promise<AuthoringResult> | undefined
  await act(async () => {
    run = authorForm(relay.ask, 'add a phone number', { current: START, ...(stop ? { stop } : {}) })
    await Promise.resolve()
  })
  await screen.findByRole('region', { name: 'Take this request to a model' })
  return { run: run! }
}

const mount = (relay: Relay, chat?: { name: string; href: string }) =>
  render(<RelayPane session={createBuilderSession(START)} relay={relay} chat={chat} />)

const requestBox = (): HTMLTextAreaElement =>
  screen.getByRole('textbox', { name: 'The request' }) as HTMLTextAreaElement

async function paste(user: ReturnType<typeof userEvent.setup>, answer: string): Promise<void> {
  await user.click(screen.getByRole('textbox', { name: 'The model’s answer' }))
  await user.paste(answer)
  await user.click(screen.getByRole('button', { name: 'Check this answer' }))
}

describe('while nothing is waiting', () => {
  test('the pane is not there at all', () => {
    // A box offering to copy a request nobody has made would be a button with nothing
    // behind it — on every tab of the builder, since it sits above them.
    const { container } = mount(createRelay())

    expect(container.innerHTML).toBe('')
  })
})

describe('a turn waiting', () => {
  test('shows the briefing folded away and the request in a box that cannot be edited', async () => {
    // Read-only, because an edited request is not the one the run will check the answer
    // against; folded, because the briefing is long and the same every turn.
    const relay = createRelay()
    mount(relay)
    await start(relay)
    const turn = relay.waiting()!

    expect(requestBox().readOnly).toBe(true)
    expect(requestBox().value).toBe(turn.prompt.user)
    const briefing = screen.getByText('What the model is told about the format').closest('details')
    expect(briefing?.textContent).toContain(turn.prompt.system)
    expect(briefing?.open).toBe(false)
  })

  test('says what leaves the page, and names no service of its own', async () => {
    // A person copying a form into a chat is giving it to that chat's operator. The pane
    // says so in its own words, from the catalogue — a claim that nothing leaves would be
    // false the moment they paste.
    const relay = createRelay()
    mount(relay)
    await start(relay)

    expect(screen.getByText(/Nothing is sent from this page\. Copying puts the whole request/)).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  test('Copy puts the whole request on the clipboard, briefing and all', async () => {
    // A request carried without its briefing is answered by a model that was never told
    // the format, and every answer fails its checks.
    const user = userEvent.setup()
    const write = vi.spyOn(navigator.clipboard, 'writeText')
    const relay = createRelay()
    mount(relay)
    await start(relay)

    await user.click(screen.getByRole('button', { name: 'Copy the request' }))

    expect(write).toHaveBeenCalledWith(relay.waiting()!.message)
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Copied.'))
  })

  test('on a retry Copy puts only what was wrong, and a new chat can still have the whole request', async () => {
    // The chat already holds the briefing and the last answer, so the whole request again
    // would be the form twice and the complaint buried at the end. A person who closed
    // that chat needs all of it.
    const user = userEvent.setup()
    const write = vi.spyOn(navigator.clipboard, 'writeText')
    const relay = createRelay()
    mount(relay)
    await start(relay)
    const first = relay.waiting()

    await paste(user, '{}')
    await waitFor(() => expect(relay.waiting()).not.toBe(first))
    const retry = relay.waiting()!
    await user.click(await screen.findByRole('button', { name: 'Copy what was wrong' }))
    await user.click(screen.getByRole('button', { name: 'New chat? Copy the whole request' }))

    expect(write.mock.calls.map(([text]) => text)).toEqual([retry.followUp, retry.message])
    expect(retry.followUp).toBeDefined()
  })

  test('a refused clipboard write selects the text to copy, and says so', async () => {
    // Over plain http, or with the permission refused, the browser will not let a page
    // write the clipboard. Saying "copied" then would send somebody to paste whatever was
    // on it before; saying nothing would leave them pressing Copy again.
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new DOMException('Write permission denied.', 'NotAllowedError'),
    )
    const relay = createRelay()
    mount(relay)
    await start(relay)

    await user.click(screen.getByRole('button', { name: 'Copy the request' }))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('did not let the page copy'),
    )
    const box = requestBox()
    expect(box.value).toBe(relay.waiting()!.message)
    expect(document.activeElement).toBe(box)
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, box.value.length])
  })

  test('links to a chat only when the host names one, in a new tab that is told nothing', async () => {
    // The chat is the host's choice; a package that linked to one would be naming a vendor.
    // `noopener noreferrer`, so the chat neither reaches back into this tab nor learns
    // which page sent the person.
    const relay = createRelay()
    mount(relay, { name: 'Example Chat', href: 'https://chat.example/new' })
    await start(relay)

    const link = screen.getByRole('link', { name: 'Open Example Chat in a new tab' }) as HTMLAnchorElement
    expect(link.href).toBe('https://chat.example/new')
    expect(link.target).toBe('_blank')
    expect(link.rel.split(' ').sort()).toEqual(['noopener', 'noreferrer'])
  })
})

describe('an answer pasted back', () => {
  test('that works ends the turn, and the pane goes', async () => {
    // The relay's answer goes through the run's checks like any host's model's; the pane
    // only hands it over.
    const user = userEvent.setup()
    const relay = createRelay()
    mount(relay)
    const { run } = await start(relay)

    await paste(user, WITH_PHONE)

    expect(await run).toMatchObject({ ok: true, attempts: 1 })
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull())
  })

  test('with no JSON object in it is held back, and only then offered anyway', async () => {
    // A copy that caught the chat's sentence and not its code block should cost a paste,
    // not an attempt. "Use it anyway" before that would be a second button doing the
    // first one's job without the check.
    const user = userEvent.setup()
    const relay = createRelay()
    mount(relay)
    await start(relay)
    const first = relay.waiting()
    expect(screen.queryByRole('button', { name: 'Use it anyway' })).toBeNull()

    await paste(user, 'Sure! I added a phone number field to your form.')

    expect(screen.getByRole('status').textContent).toContain('There is no JSON object in that answer')
    expect(relay.waiting()).toBe(first)

    await user.click(screen.getByRole('button', { name: 'Use it anyway' }))

    await waitFor(() => expect(relay.waiting()?.prompt.attempt).toBe(2))
    expect(relay.waiting()?.followUp).toContain('That was not JSON')
  })
})

describe('a stopped run', () => {
  test('takes its turn off the screen', async () => {
    // Left there, the request would invite a paste the run can no longer take.
    const relay = createRelay()
    const stop = createStop()
    mount(relay)
    const { run } = await start(relay, stop)

    act(() => stop.stop())

    expect(screen.queryByRole('region')).toBeNull()
    expect(await run).toMatchObject({ ok: false, ended: 'stopped' })
  })
})

describe('the turn it is on', () => {
  test('says which, of how many', async () => {
    // Each turn is a round trip by hand; a person deciding whether to try once more
    // needs to know how many the run will take.
    const relay = createRelay()
    mount(relay)
    await start(relay)

    const pane = screen.getByRole('region', { name: 'Take this request to a model' })
    expect(within(pane).getByText('Turn 1 of at most 3')).toBeTruthy()
  })
})

describe('the relay it follows', () => {
  test('is the one it is given now: a relay replaced is let go', async () => {
    // A prop can be replaced. A pane still listening to the relay it was first given would
    // draw that relay's turn — a request from a run this pane's host no longer asks.
    const first = createRelay()
    const second = createRelay()
    const session = createBuilderSession(START)
    const view = render(<RelayPane session={session} relay={first} />)
    view.rerender(<RelayPane session={session} relay={second} />)

    await act(async () => {
      void authorForm(first.ask, 'add a phone number', { current: START })
      await Promise.resolve()
    })
    expect(screen.queryByRole('region')).toBeNull()

    await act(async () => {
      void authorForm(second.ask, 'add a fax number', { current: START })
      await Promise.resolve()
    })
    expect(await screen.findByRole('region', { name: 'Take this request to a model' })).toBeTruthy()
  })
})
