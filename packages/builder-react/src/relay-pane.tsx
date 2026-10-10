import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import type { BuilderMessageId, BuilderSession, Relay, RelayChat, RelayTurn } from '@formancy/builder-core'

/**
 * A model's turn, carried by a person: the request copied out, the answer pasted back.
 *
 * For a host whose page may not call a model — formancy.ai's own, which asks no other
 * site for anything ([0154](../../../docs/decisions/0154-the-website-makes-no-request-to-any-other-site.md)).
 * The prompt pane asks `relay.ask` as it would any host's model, and this pane shows the
 * turn that is waiting: the briefing, folded away, and the request in a box that cannot be
 * edited, with Copy. The person takes it to a chat of their own and pastes the answer
 * back, and from there the run checks it as it checks any answer
 * ([0160](../../../docs/decisions/0160-a-person-carries-the-models-turn.md)).
 *
 * When a paste counts, and what a stop does to the turn, are `@formancy/builder-core`'s
 * (`createRelay`), so the Angular pane cannot decide either differently. This is the
 * markup, the clipboard, the focus and a subscription. The focus is the DOM's, which
 * builder-core has none of, so each pane moves it; both `relay-pane.test` files hold them
 * to the same.
 *
 * **It names no service.** The link to a chat is the host's `chat`, and without one there
 * is no link; the request is copied all the same. What the pane says about what leaves the
 * page is the catalogue's, and names no service either.
 */
export interface RelayPaneProps {
  /** For its language: every word here is the session's catalogue's (0114). */
  session: BuilderSession
  /** The relay the prompt pane is asking, from `createRelay`. */
  relay: Relay
  /** Where to take the request, if the host names somewhere. Absent, the pane links nowhere. */
  chat?: RelayChat | undefined
}

/** What the pane last said about the turn, in its live region. */
type Said = 'copied' | 'copy-refused' | 'no-object'

/** What the pane holds about one turn, and which turn it is about. */
interface Held {
  readonly turn: RelayTurn
  /** What has been pasted into the answer box. */
  readonly answer: string
  readonly said: Said | undefined
  /** What Copy tried to write when the browser refused, shown in the request box instead. */
  readonly toCopy: string | undefined
}

const SAID: Readonly<Record<Said, BuilderMessageId>> = {
  copied: 'relay.copied',
  'copy-refused': 'relay.copyRefused',
  'no-object': 'relay.noObject',
}

export function RelayPane({ session, relay, chat }: RelayPaneProps): ReactElement | null {
  const { text } = session
  const turn = useSyncExternalStore(relay.subscribe, relay.waiting, relay.waiting)
  /*
   * Tagged with the turn it is about, so the next turn starts clean — an answer pasted
   * for one is never offered to the next — without an effect copying state into state.
   */
  const [held, setHeld] = useState<Held | undefined>(undefined)
  const headingId = useId()
  const turnId = useId()
  const guideId = useId()
  const requestId = useId()
  const answerId = useId()
  const requestBox = useRef<HTMLTextAreaElement>(null)
  const copyButton = useRef<HTMLButtonElement>(null)
  /*
   * Every turn drawn takes the focus to Copy. The page is waiting on the person now, and
   * nothing else says so: the prompt pane, where they pressed Write, still says the form is
   * being written, and an answer that failed took this pane — and the focus in it — away
   * before the retry drew it again. Copy's description is the turn and what to do with it,
   * so landing there is also being told.
   */
  useEffect(() => {
    if (turn !== undefined) copyButton.current?.focus()
  }, [turn])
  /**
   * Set when the browser refused a copy. The text goes into the request box on the next
   * render, and is selected once it is there — so the person can copy it with the keyboard.
   * A ref an effect reads, as the prompt pane's refocus is: `flushSync` would have done it
   * in the handler, and would have made `react-dom` a dependency of this package for it.
   */
  const selectNext = useRef(false)
  useEffect(() => {
    if (!selectNext.current) return
    selectNext.current = false
    requestBox.current?.focus()
    requestBox.current?.select()
  }, [held])

  if (turn === undefined) return null
  const fresh: Held = { turn, answer: '', said: undefined, toCopy: undefined }
  const mine: Held = held?.turn === turn ? held : fresh
  /** Change what is held about this turn, starting it clean if it is new. */
  const update = (change: Partial<Omit<Held, 'turn'>>): void =>
    setHeld((before) => ({ ...(before?.turn === turn ? before : fresh), ...change }))

  const copy = async (what: string): Promise<void> => {
    const copied = await written(what)
    // A late answer from the clipboard about a turn that has gone says nothing.
    if (relay.waiting() !== turn) return
    if (copied) {
      update({ said: 'copied', toCopy: undefined })
      return
    }
    // Refused — plain http, a permission denied. The text goes in the request box, and is
    // selected there once drawn.
    selectNext.current = true
    update({ said: 'copy-refused', toCopy: what })
  }

  const send = (anyway: boolean): void => {
    if (relay.answer(mine.answer, { anyway }) === 'no-object') update({ said: 'no-object' })
  }

  const retry = turn.followUp !== undefined

  return (
    <section data-formancy-part="relay-pane" aria-labelledby={headingId}>
      <h3 id={headingId}>{text('relay.title')}</h3>
      <p id={turnId}>{text('relay.turn', { attempt: turn.prompt.attempt, limit: turn.prompt.limit })}</p>
      <p id={guideId}>{text(retry ? 'relay.retry' : 'relay.first')}</p>
      <p>{text('relay.leaves')}</p>

      <div data-formancy-part="relay-request">
        <details>
          <summary>{text('relay.system')}</summary>
          <pre>{turn.prompt.system}</pre>
        </details>
        <label htmlFor={requestId}>{text('relay.request')}</label>
        <textarea ref={requestBox} id={requestId} readOnly rows={6} value={mine.toCopy ?? turn.prompt.user} />
        {/* On a retry the chat already holds the briefing and the last answer, so what is
            copied first is what was wrong, alone; a new chat needs the whole request. */}
        <button
          ref={copyButton}
          type="button"
          aria-describedby={`${turnId} ${guideId}`}
          onClick={() => void copy(retry ? (turn.followUp ?? turn.message) : turn.message)}
        >
          {text(retry ? 'relay.copyFollowUp' : 'relay.copy')}
        </button>
        {retry ? (
          <button type="button" onClick={() => void copy(turn.message)}>
            {text('relay.copyAll')}
          </button>
        ) : null}
        {chat === undefined ? null : (
          <a href={chat.href} target="_blank" rel="noopener noreferrer">
            {text('relay.open', { name: chat.name })}
          </a>
        )}
      </div>

      <div data-formancy-part="relay-answer">
        <label htmlFor={answerId}>{text('relay.answer')}</label>
        <textarea
          id={answerId}
          rows={6}
          value={mine.answer}
          // A changed answer has not been checked, so "use it anyway" no longer applies.
          onChange={(event) =>
            update({ answer: event.target.value, ...(mine.said === 'no-object' ? { said: undefined } : {}) })
          }
        />
        <button type="button" disabled={mine.answer.trim() === ''} onClick={() => send(false)}>
          {text('relay.check')}
        </button>
        {mine.said === 'no-object' ? (
          <button type="button" onClick={() => send(true)}>
            {text('relay.anyway')}
          </button>
        ) : null}
      </div>

      <p role="status">{mine.said === undefined ? '' : text(SAID[mine.said])}</p>
    </section>
  )
}

/** Whether the browser let the page write `what` to the clipboard. */
async function written(what: string): Promise<boolean> {
  try {
    // Absent over plain http: the call throws, and that is a refusal too.
    await navigator.clipboard.writeText(what)
    return true
  } catch {
    return false
  }
}
