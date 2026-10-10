import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { render, screen, waitFor, within } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, onTestFinished, test, vi } from 'vitest'
import { authorForm, createBuilderSession, createRelay, createStop } from '@formancy/builder-core'
import type { AuthoringResult, Relay, Stop } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { FormancyRelayPane } from './relay-pane.js'

/**
 * The same assertions as packages/builder-react/src/relay-pane.test.tsx.
 *
 * Written twice on purpose, as the prompt pane's are: the markup, the clipboard and the
 * focus are each builder's own, and what is pinned is what a person touches — what Copy
 * writes and that it sends nothing anywhere, what a refused write does, that a chat is
 * linked only when the host names one, that each turn starts clean, and that a turn
 * arriving takes the person to it.
 * When a paste counts is `createRelay`'s, tested once in `@formancy/builder-core`
 * ([0160](../../../docs/decisions/0160-a-person-carries-the-models-turn.md)).
 */
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
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

const session = createBuilderSession(START)

async function mount(relay: Relay, chat?: { name: string; href: string }) {
  return render(FormancyRelayPane, {
    inputs: { session, relay, chat } as Record<string, unknown>,
    providers: [provideZonelessChangeDetection()],
  })
}

/**
 * Start a run on the relay, as a prompt pane would, and wait for the pane to show its turn.
 * Inside an object, because an async function returning the run would wait for it.
 */
async function start(relay: Relay, stop?: Stop): Promise<{ run: Promise<AuthoringResult> }> {
  const run = authorForm(relay.ask, 'add a phone number', { current: START, ...(stop ? { stop } : {}) })
  await screen.findByRole('region', { name: 'Take this request to a model' })
  return { run }
}

const requestBox = (): HTMLTextAreaElement =>
  screen.getByRole('textbox', { name: 'The request' }) as HTMLTextAreaElement

/**
 * Every way a page sends something, spied: what the pane's sentence says Copy does not do.
 * `sendBeacon` is defined where jsdom has none, so a call is recorded rather than thrown.
 */
function outbound() {
  const beacon = vi.fn(() => true)
  const had = Object.getOwnPropertyDescriptor(navigator, 'sendBeacon')
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon })
  onTestFinished(() => {
    if (had === undefined) Reflect.deleteProperty(navigator, 'sendBeacon')
    else Object.defineProperty(navigator, 'sendBeacon', had)
  })
  return {
    fetch: vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('a test reaches no network')),
    xhr: vi.spyOn(XMLHttpRequest.prototype, 'open'),
    window: vi.spyOn(window, 'open').mockReturnValue(null).mockName('window.open'),
    beacon,
  }
}

async function paste(user: ReturnType<typeof userEvent.setup>, answer: string): Promise<void> {
  await user.click(screen.getByRole('textbox', { name: 'The model’s answer' }))
  await user.paste(answer)
  await user.click(screen.getByRole('button', { name: 'Check this answer' }))
}

describe('while nothing is waiting', () => {
  test('the pane is not there at all', async () => {
    // A box offering to copy a request nobody has made would be a button with nothing
    // behind it — on every tab of the builder, since it sits above them.
    await mount(createRelay())

    expect(screen.queryByRole('region')).toBeNull()
    expect(document.querySelector('[data-formancy-part="relay-pane"]')).toBeNull()
  })
})

describe('a turn waiting', () => {
  test('shows the briefing folded away and the request in a box that cannot be edited', async () => {
    // Read-only, because an edited request is not the one the run will check the answer
    // against; folded, because the briefing is long and the same every turn.
    const relay = createRelay()
    await mount(relay)
    await start(relay)
    const turn = relay.waiting()!

    expect(requestBox().readOnly).toBe(true)
    expect(requestBox().value).toBe(turn.prompt.user)
    const briefing = screen.getByText('What the model is told about the format').closest('details')
    expect(briefing?.textContent).toContain(turn.prompt.system)
    expect(briefing?.open).toBe(false)
  })

  test('says what Copy does with the request, and names no service of its own', async () => {
    // A person copying a form into a chat is giving it to that chat's operator. The pane
    // says so in the catalogue's sentence, whatever its wording; what the sentence claims
    // about Copy is held by the case after this one, not by matching its words.
    const relay = createRelay()
    await mount(relay)
    await start(relay)

    expect(screen.getByText(session.text('relay.leaves'))).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  test('Copy sends the request nowhere: every copy, on a first turn and a retry, only writes the clipboard', async () => {
    // The sentence above says so, and it ships in a package drawn on pages this repository
    // never sees. So it is held of the pane alone: a Copy that also posted the request, or
    // opened the chat itself, would be the pane carrying it out rather than the person.
    const user = userEvent.setup()
    const sent = outbound()
    const write = vi.spyOn(navigator.clipboard, 'writeText')
    const relay = createRelay()
    await mount(relay, { name: 'Example Chat', href: 'https://chat.example/new' })
    await start(relay)

    await user.click(screen.getByRole('button', { name: 'Copy the request' }))
    await paste(user, '{}')
    await user.click(await screen.findByRole('button', { name: 'Copy what was wrong' }))
    await user.click(screen.getByRole('button', { name: 'New chat? Copy the whole request' }))

    await waitFor(() => expect(write).toHaveBeenCalledTimes(3))
    expect(sent.fetch).not.toHaveBeenCalled()
    expect(sent.xhr).not.toHaveBeenCalled()
    expect(sent.beacon).not.toHaveBeenCalled()
    expect(sent.window).not.toHaveBeenCalled()
  })

  test('Copy puts the whole request on the clipboard, briefing and all', async () => {
    // A request carried without its briefing is answered by a model that was never told
    // the format, and every answer fails its checks.
    const user = userEvent.setup()
    const write = vi.spyOn(navigator.clipboard, 'writeText')
    const relay = createRelay()
    await mount(relay)
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
    await mount(relay)
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
    await mount(relay)
    await start(relay)

    await user.click(screen.getByRole('button', { name: 'Copy the request' }))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('did not let the page copy'),
    )
    await waitFor(() => expect(document.activeElement).toBe(requestBox()))
    const box = requestBox()
    expect(box.value).toBe(relay.waiting()!.message)
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, box.value.length])
  })

  test('links to a chat only when the host names one, in a new tab that is told nothing', async () => {
    // The chat is the host's choice; a package that linked to one would be naming a vendor.
    // `noopener noreferrer`, so the chat neither reaches back into this tab nor learns
    // which page sent the person.
    const relay = createRelay()
    await mount(relay, { name: 'Example Chat', href: 'https://chat.example/new' })
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
    await mount(relay)
    const { run } = await start(relay)

    await paste(user, WITH_PHONE)

    expect(await run).toMatchObject({ ok: true, attempts: 1 })
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull())
  })

  test('edited after it was held back, is no longer offered anyway', async () => {
    // "Use it anyway" is about the text that was checked. Left on screen after an edit, it
    // would send the new text unchecked — a paste that may well hold the object now.
    const user = userEvent.setup()
    const relay = createRelay()
    await mount(relay)
    await start(relay)
    await paste(user, 'Sure! I added a phone number field to your form.')
    expect(await screen.findByRole('button', { name: 'Use it anyway' })).toBeTruthy()

    await user.type(screen.getByRole('textbox', { name: 'The model’s answer' }), ' Here it is.')

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Use it anyway' })).toBeNull())
    expect(screen.getByRole('status').textContent?.trim()).toBe('')
  })

  test('with no JSON object in it is held back, and only then offered anyway', async () => {
    // A copy that caught the chat's sentence and not its code block should cost a paste,
    // not an attempt. "Use it anyway" before that would be a second button doing the
    // first one's job without the check.
    const user = userEvent.setup()
    const relay = createRelay()
    await mount(relay)
    await start(relay)
    const first = relay.waiting()
    expect(screen.queryByRole('button', { name: 'Use it anyway' })).toBeNull()

    await paste(user, 'Sure! I added a phone number field to your form.')

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('There is no JSON object in that answer'),
    )
    expect(relay.waiting()).toBe(first)

    await user.click(await screen.findByRole('button', { name: 'Use it anyway' }))

    await waitFor(() => expect(relay.waiting()?.prompt.attempt).toBe(2))
    expect(relay.waiting()?.followUp).toContain('That was not JSON')
  })
})

describe('a stopped run', () => {
  test('takes its turn off the screen', async () => {
    // Left there, the request would invite a paste the run can no longer take.
    const relay = createRelay()
    const stop = createStop()
    await mount(relay)
    const { run } = await start(relay, stop)

    stop.stop()

    await waitFor(() => expect(screen.queryByRole('region')).toBeNull())
    expect(await run).toMatchObject({ ok: false, ended: 'stopped' })
  })

  test('leaves nothing of its answer box to the next request', async () => {
    // The relay clears a stopped turn so that a late paste is never proposed for the next
    // request (D10). The pane outlives the turn, though, and an answer still in its box —
    // pasted, held back, never sent — would sit in the next run's box one press from
    // being checked against a request it was not written for.
    const user = userEvent.setup()
    const relay = createRelay()
    const stop = createStop()
    await mount(relay)
    await start(relay, stop)
    await paste(user, 'Sure! I added a phone number field to your form.')
    expect(await screen.findByRole('button', { name: 'Use it anyway' })).toBeTruthy()

    stop.stop()
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull())
    await start(relay)

    expect((screen.getByRole('textbox', { name: 'The model’s answer' }) as HTMLTextAreaElement).value).toBe('')
    expect(screen.queryByRole('button', { name: 'Use it anyway' })).toBeNull()
    expect(screen.getByRole('status').textContent?.trim()).toBe('')
  })
})

describe('a turn arriving', () => {
  test('takes the person to Copy, which says what the page is waiting for', async () => {
    // The page now waits on the person, and the prompt pane, where they pressed Write,
    // says only that the form is being written. Focus on Copy puts them where the next
    // step is, and its description is the turn and what to do with it — read out on focus.
    const relay = createRelay()
    await mount(relay)
    await start(relay)

    const copy = screen.getByRole('button', {
      name: 'Copy the request',
      description: 'Turn 1 of at most 3 ' + session.text('relay.first'),
    })
    await waitFor(() => expect(document.activeElement).toBe(copy))
  })

  test('and so does a retry, after the pasted answer failed and its pane went', async () => {
    // An answer that is checked ends the turn, and the pane goes with the focus that was
    // in it. The next turn is the only place that says the answer did not work, so it
    // takes the focus back, and says so.
    const user = userEvent.setup()
    const relay = createRelay()
    await mount(relay)
    await start(relay)

    await paste(user, '{}')

    const copy = await screen.findByRole('button', {
      name: 'Copy what was wrong',
      description: 'Turn 2 of at most 3 ' + session.text('relay.retry'),
    })
    await waitFor(() => expect(document.activeElement).toBe(copy))
  })
})

describe('the turn it is on', () => {
  test('says which, of how many', async () => {
    // Each turn is a round trip by hand; a person deciding whether to try once more
    // needs to know how many the run will take.
    const relay = createRelay()
    await mount(relay)
    await start(relay)

    const pane = screen.getByRole('region', { name: 'Take this request to a model' })
    expect(within(pane).getByText('Turn 1 of at most 3')).toBeTruthy()
  })
})

describe('the relay it follows', () => {
  test('is the one it is given now: a relay replaced is let go', async () => {
    // An input can be replaced. A pane still listening to the relay it was first given
    // would draw that relay's turn — a request from a run this pane's host no longer asks.
    const first = createRelay()
    const second = createRelay()
    const view = await mount(first)
    view.fixture.componentRef.setInput('relay', second)
    await view.fixture.whenStable()

    void authorForm(first.ask, 'add a phone number', { current: START })
    await new Promise((settle) => setTimeout(settle, 50))
    await view.fixture.whenStable()
    expect(screen.queryByRole('region')).toBeNull()

    void authorForm(second.ask, 'add a fax number', { current: START })
    expect(await screen.findByRole('region', { name: 'Take this request to a model' })).toBeTruthy()
  })

  test('and is listened to once, however many turns pass', async () => {
    // Subscribed from an effect: one that also read the turn would subscribe again on
    // every turn, for a listener that changes nothing.
    const user = userEvent.setup()
    const relay = createRelay()
    const subscribe = vi.spyOn(relay, 'subscribe')
    await mount(relay)
    await start(relay)

    await paste(user, '{}')
    await waitFor(() => expect(relay.waiting()?.prompt.attempt).toBe(2))
    await screen.findByRole('button', { name: 'Copy what was wrong' })

    expect(subscribe).toHaveBeenCalledTimes(1)
  })
})
