import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core'
import type { BuilderMessageId } from '@formancy/builder-core'
import { BuilderTextPipe } from './text.pipe.js'
import type { BuilderSession, Relay, RelayChat, RelayTurn } from './types.js'

/** What the pane last said about the turn, in its live region. */
type Said = 'copied' | 'copy-refused' | 'no-object'

const SAID: Readonly<Record<Said, BuilderMessageId>> = {
  copied: 'relay.copied',
  'copy-refused': 'relay.copyRefused',
  'no-object': 'relay.noObject',
}

/**
 * A model's turn, carried by a person: the request copied out, the answer pasted back.
 *
 * The Angular half of the React `RelayPane`, for a host whose page may not call a model —
 * formancy.ai's own, which asks no other site for anything
 * ([0154](../../../docs/decisions/0154-the-website-makes-no-request-to-any-other-site.md)).
 * The prompt pane asks `relay.ask`, and this pane shows the turn waiting: the briefing,
 * folded away, and the request in a box that cannot be edited, with Copy. What is pasted
 * back is checked by the run as any answer is
 * ([0159](../../../docs/decisions/0159-a-person-carries-the-models-turn.md)).
 *
 * When a paste counts and what a stop does to the turn are `createRelay`'s, in
 * `@formancy/builder-core`, so the two panes cannot decide either differently
 * ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)). This is the
 * markup, the clipboard and a subscription: the relay's turn as a signal, followed as
 * `injectBuilderView` follows a session, and replaced with the input.
 *
 * **It names no service.** The link to a chat is the host's `chat`, and without one there
 * is no link.
 */
@Component({
  selector: 'formancy-relay-pane',
  imports: [BuilderTextPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (turn(); as waiting) {
      <section data-formancy-part="relay-pane" [attr.aria-labelledby]="headingId">
        <h3 [id]="headingId">{{ 'relay.title' | builderText: text() }}</h3>
        <p>
          {{
            'relay.turn'
              | builderText: text() : { attempt: waiting.prompt.attempt, limit: waiting.prompt.limit }
          }}
        </p>
        <p>{{ (retry() ? 'relay.retry' : 'relay.first') | builderText: text() }}</p>
        <p>{{ 'relay.leaves' | builderText: text() }}</p>

        <div data-formancy-part="relay-request">
          <details>
            <summary>{{ 'relay.system' | builderText: text() }}</summary>
            <pre>{{ waiting.prompt.system }}</pre>
          </details>
          <label [attr.for]="requestId">{{ 'relay.request' | builderText: text() }}</label>
          <textarea
            #requestBox
            [id]="requestId"
            readonly
            rows="6"
            [value]="toCopy() ?? waiting.prompt.user"
          ></textarea>
          <!-- On a retry the chat already holds the briefing and the last answer, so what
               is copied first is what was wrong, alone; a new chat needs the whole request. -->
          <button type="button" (click)="copy(retry() ? (waiting.followUp ?? waiting.message) : waiting.message)">
            {{ (retry() ? 'relay.copyFollowUp' : 'relay.copy') | builderText: text() }}
          </button>
          @if (retry()) {
            <button type="button" (click)="copy(waiting.message)">
              {{ 'relay.copyAll' | builderText: text() }}
            </button>
          }
          @if (chat(); as where) {
            <a [href]="where.href" target="_blank" rel="noopener noreferrer">
              {{ 'relay.open' | builderText: text() : { name: where.name } }}
            </a>
          }
        </div>

        <div data-formancy-part="relay-answer">
          <label [attr.for]="answerId">{{ 'relay.answer' | builderText: text() }}</label>
          <textarea
            [id]="answerId"
            rows="6"
            [value]="answer()"
            (input)="edit($any($event.target).value)"
          ></textarea>
          <button type="button" [disabled]="answer().trim() === ''" (click)="send(false)">
            {{ 'relay.check' | builderText: text() }}
          </button>
          @if (said() === 'no-object') {
            <button type="button" (click)="send(true)">
              {{ 'relay.anyway' | builderText: text() }}
            </button>
          }
        </div>

        <p role="status">{{ status() }}</p>
      </section>
    }
  `,
})
export class FormancyRelayPane {
  readonly session = input.required<BuilderSession>()
  /** The relay the prompt pane is asking, from `createRelay`. */
  readonly relay = input.required<Relay>()
  /** Where to take the request, if the host names somewhere. Absent, the pane links nowhere. */
  readonly chat = input<RelayChat | undefined>(undefined)

  /** The turn waiting, followed from the relay. */
  protected readonly turn = signal<RelayTurn | undefined>(undefined)
  /** What has been pasted into the answer box, for this turn. */
  protected readonly answer = signal('')
  protected readonly said = signal<Said | undefined>(undefined)
  /** What Copy tried to write when the browser refused, shown in the request box instead. */
  protected readonly toCopy = signal<string | undefined>(undefined)

  protected readonly retry = computed(() => this.turn()?.followUp !== undefined)
  /** Every word this pane shows, in the language the session was opened in (0114). */
  protected readonly text = computed(() => this.session().text)
  protected readonly status = computed(() => {
    const said = this.said()
    return said === undefined ? '' : this.text()(SAID[said])
  })

  private static sequence = 0
  private readonly serial = (FormancyRelayPane.sequence += 1)
  protected readonly headingId = `formancy-relay-${String(this.serial)}`
  protected readonly requestId = `formancy-relay-request-${String(this.serial)}`
  protected readonly answerId = `formancy-relay-answer-${String(this.serial)}`

  private readonly requestBox = viewChild<ElementRef<HTMLTextAreaElement>>('requestBox')
  private readonly injector = inject(Injector)

  constructor() {
    let unsubscribe: (() => void) | undefined
    effect(() => {
      const relay = this.relay()
      unsubscribe?.()
      // Untracked: `follow` reads the turn it replaces, and the subscription is to the
      // relay input alone — not renewed every time the turn it reports changes.
      untracked(() => this.follow(relay.waiting()))
      unsubscribe = relay.subscribe(() => this.follow(relay.waiting()))
    })
    inject(DestroyRef).onDestroy(() => unsubscribe?.())
  }

  /**
   * The relay's turn now. A different one starts clean: an answer pasted for one turn is
   * never offered to the next.
   */
  private follow(turn: RelayTurn | undefined): void {
    if (turn === this.turn()) return
    this.turn.set(turn)
    this.answer.set('')
    this.said.set(undefined)
    this.toCopy.set(undefined)
  }

  protected async copy(what: string): Promise<void> {
    const turn = this.turn()
    const copied = await written(what)
    // A late answer from the clipboard about a turn that has gone says nothing.
    if (this.turn() !== turn) return
    if (copied) {
      this.said.set('copied')
      this.toCopy.set(undefined)
      return
    }
    // Refused — plain http, a permission denied. The text goes in the request box, drawn
    // before it is selected, so the person can copy it with the keyboard.
    this.said.set('copy-refused')
    this.toCopy.set(what)
    afterNextRender(
      () => {
        const box = this.requestBox()?.nativeElement
        box?.focus()
        box?.select()
      },
      { injector: this.injector },
    )
  }

  protected edit(answer: string): void {
    this.answer.set(answer)
    // A changed answer has not been checked, so "use it anyway" no longer applies.
    if (this.said() === 'no-object') this.said.set(undefined)
  }

  protected send(anyway: boolean): void {
    if (this.relay().answer(this.answer(), { anyway }) === 'no-object') this.said.set('no-object')
  }
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
