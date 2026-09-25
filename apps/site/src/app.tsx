import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactElement, ReactNode } from 'react'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import { FormancyForm, FormancyProvider, UploaderProvider } from '@formancy/react'
import '@formancy/themes/dusk.css'
import './site.css'
import { EXAMPLES } from './examples.js'
import { demoUploader } from './demo-uploader.js'
import { LiveRules, highlight, sourceOf } from './source.js'
import { useJourney } from './use-journey.js'

/**
 * formancy.ai.
 *
 * The page makes one argument and is shaped like it: the same engine runs in
 * the browser and on the server, so the two cannot disagree about whether a
 * submission is valid. Violet is the browser and teal is the server
 * throughout, and they appear together only where that pairing is the point.
 *
 * The forms a third of the way down are real — formancy documents handed to
 * `@formancy/react`, with the engine, the ARIA wiring and the theme a consumer
 * gets. A landing page for a form engine that shows a picture of a form is a
 * landing page arguing against its own product.
 */

const REPO = 'https://github.com/sharkysan/formancy.ai'

/**
 * Where the playground lives.
 *
 * One origin in production, where the site and the playground are served from
 * the same host — and two Vite servers in development, where a relative path
 * would land on whichever app is being worked on rather than the playground. A
 * link that is broken for everybody developing the site is a link nobody
 * notices is broken in production either.
 *
 * The trailing slash is load-bearing. `/playground` is a directory, and
 * whether it resolves to `/playground/index.html` depends on the static host:
 * some redirect, some 404. Asking for the address we actually mean costs
 * nothing and removes the host from the question.
 */
const PLAYGROUND = import.meta.env.DEV ? 'http://localhost:4381/' : '/playground/'

export function App(): ReactElement {
  const journey = useJourney()

  return (
    <>
      <Backdrop />

      <a className="skip" href="#start">
        Skip to content
      </a>

      <header className="bar">
        <strong>
          <Mark />
          formancy.ai
        </strong>
        <nav>
          <a className="optional" href="#engine">
            How it works
          </a>
          <a className="optional" href="#build">
            Examples
          </a>
          <a className="optional" href="#agents">
            Agents
          </a>
          <a className="optional" href="#run">
            Run it
          </a>
          <a href={PLAYGROUND}>Playground</a>
          <a className="bar-cta" href={REPO} rel="noreferrer noopener">
            GitHub
          </a>
        </nav>
        <div className="rail" aria-hidden="true" />
      </header>

      <main className="page" id="start">
        <Section id="hero" className="hero wide" journey={journey} section="hero">
          <div className="hero-copy">
            <a className="pill" href="#agents">
              <span className="pill-tag">New</span>
              Your coding agent writes the forms now
              <span aria-hidden="true"> →</span>
            </a>
            <h1>
              <span className="glow">One engine,</span> running in the browser and on the server.
            </h1>
            <p className="lede">
              A form is a JSON document. formancy compiles it once and runs it in both places, so
              what the person filling it in was told and what your server accepts can never drift
              apart.
            </p>
            <div className="actions">
              <a className="action primary" href="#build">
                Try a live form
              </a>
              <a className="action" href={REPO} rel="noreferrer noopener">
                Star on GitHub
              </a>
            </div>
          </div>

          <Planes />
        </Section>

        <Marquee />

        <div className="wide readings-wrap">
          <Readings />
        </div>

        <Section id="engine" className="wide" journey={journey} section="engine">
          <p className="eyebrow">The problem</p>
          <h2>The same rule, written twice, is two rules.</h2>
          <p className="lede">
            Most form stacks check a form in the browser with one piece of code and on the server
            with another. They agree until they don&rsquo;t — and the day they stop is the day
            somebody&rsquo;s order is accepted by one and rejected by the other.
          </p>

          <div className="mirror">
            <div>
              <b>Browser</b>
              <span className="expr">ticket == &apos;pro&apos;</span>
              <i>shows the workshops</i>
            </div>
            <span className="mirror-eq" aria-hidden="true">
              ≡
            </span>
            <div>
              <b>Server</b>
              <span className="expr">ticket == &apos;pro&apos;</span>
              <i>accepts the workshops</i>
            </div>
          </div>

          <div className="pair">
            <div className="side">
              <h3>@formancy/core</h3>
              <p>
                Compiles the document into one evaluation graph: visibility, requiredness,
                calculations, validation. No DOM, no Node, no framework — which is what lets the
                identical build run in both places.
              </p>
            </div>
            <div className="side server">
              <h3>@formancy/server</h3>
              <p>
                Replays every submission through that same graph against the exact version the
                browser rendered, recomputes what the client claimed, and stores the result it
                worked out itself.
              </p>
            </div>
          </div>
        </Section>

        <Section id="build" className="wide" journey={journey} section="builder">
          <p className="eyebrow">Live, not a screenshot</p>
          <h2>A document on the left. A working form on the right.</h2>
          <p className="lede">
            Three real formancy documents, rendered by <code>@formancy/react</code> right here.
            Answer a question and watch the rules underneath light up — that is the engine
            thinking, the same one your server would run.
          </p>

          <Examples />

          <p className="note">
            Nothing here is sent anywhere — the page is a static site, and a file you attach stays
            in this tab, which the submission says out loud rather than pretending otherwise.{' '}
            <a href={PLAYGROUND}>Open the playground</a> to edit a document yourself and watch
            React and Angular render the same change.
          </p>
        </Section>

        <Section id="features" className="wide" journey={journey} section="features">
          <p className="eyebrow">Batteries, checked</p>
          <h2>Everything a form needs after somebody presses submit.</h2>
          <Features />
        </Section>

        <Section id="agents" className="wide" journey={journey} section="agents">
          <div className="agents">
            <div>
              <p className="eyebrow">For coding agents</p>
              <h2>Your agent writes the form. formancy checks it before anyone sees it.</h2>
              <p className="lede">
                One line gives Claude Code — or any MCP client — seven tools. Four of them work
                with no server and no account. The agent writes a form, is told exactly which
                expression would silently compute nothing, fixes it, and publishes.
              </p>
              <p className="note">
                The builder does the same thing for people: describe a form in a sentence and get
                one — through the same validation, so nothing reaches the editor until it would
                actually work.
              </p>
            </div>
            <Transcript />
          </div>
        </Section>

        <Section id="stack" className="wide" journey={journey} section="stack">
          <p className="eyebrow">Architecture</p>
          <h2>
            One engine. Two bindings. Your markup on top.
            <span className="depth" aria-hidden="true">
              <i />
            </span>
          </h2>
          <p className="lede">
            Everything shared sits at the bottom, and it is the larger part. Only the binding is
            written twice — React hooks on one side, zoneless Angular signals on the other — and
            neither ships a stylesheet you have to fight.
          </p>

          {/* One list, not a diagram beside a list. The planes below ARE these
              items: a reader with no 3D, no scroll timelines or no patience for
              either gets an ordered list of the packages, in build order, which
              is the content. The geometry is a second way of reading it. */}
          <ol className="stack" aria-label="The packages, in build order">
            <li className="stratum" data-plane="shared">
              <b>@formancy/spec</b>
              <span>The document format, its JSON Schema, and a canonical hash of it.</span>
            </li>
            <li className="stratum" data-plane="shared">
              <b>@formancy/expressions</b>
              <span>
                CEL, parsed and type-checked. No <code>eval</code>, anywhere, ever.
              </span>
            </li>
            <li className="stratum" data-plane="shared">
              <b>@formancy/core</b>
              <span>The engine: visibility, requiredness, calculation, validation, ARIA ids.</span>
            </li>
            <li className="stratum" data-plane="split">
              <b>@formancy/react · @formancy/angular</b>
              <span>Hooks on one side, signals on the other. Neither wraps the other.</span>
            </li>
            <li className="stratum" data-plane="optional">
              <b>@formancy/themes</b>
              <span>Dusk, Blueprint, Workbench — or none of them. Styling is opt-in.</span>
            </li>
            <li className="stratum" data-plane="yours">
              <b>your design system</b>
              <span>Nothing below this line knows it exists, which is the point.</span>
            </li>
          </ol>

          <p className="note">
            The server imports the same three bottom layers the browser does — the identical build,
            not a port of it. Both renderers are held to one published conformance suite, and a
            renderer that behaves differently fails it, including one somebody else writes.
          </p>
        </Section>

        <Section id="access" className="wide" journey={journey} section="access">
          <p className="eyebrow">Accessibility</p>
          <h2>Built by keyboard, before it was built by mouse.</h2>
          <p className="lede">
            WCAG 2.2 requires every drag to have an equivalent that is not a drag. The
            builder&rsquo;s keyboard path was written first, and the drag surfaces call the same
            commands — which is the only order that leaves the keyboard path finished.
          </p>

          <div className="keys">
            <kbd>a</kbd>
            <span>add a field, a row, a column or a section</span>
            <kbd>m</kbd>
            <span>move the focused one, choosing from destinations read as sentences</span>
            <kbd>u</kbd>
            <span>unwrap a row, keeping what is inside it</span>
            <kbd>Ctrl&nbsp;+&nbsp;Z</kbd>
            <span>undo, over a document model rather than over the DOM</span>
          </div>
        </Section>

        <Section id="run" className="wide" journey={journey} section="host">
          <p className="eyebrow">Self-hosted</p>
          <h2>It is a container and a database.</h2>
          <p className="lede">
            Submissions bound immutably to the version that produced them, drafts that migrate on
            resume, CSV export across versions, webhooks from a transactional outbox, and an audit
            log that records who read what.
          </p>

          <div className="terminal">
            <header>
              <span className="lights" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              zsh
            </header>
            <pre>
              <span className="prompt">$</span> docker compose up -d{'\n'}
              <span className="ok">✔</span>
              <span className="out"> postgres   :5439</span>
              {'\n'}
              <span className="ok">✔</span>
              <span className="out"> formancy   :4380</span>
              {'\n'}
              <span className="ok">✔</span>
              <span className="out"> admin      :4382</span>
            </pre>
          </div>

          <p className="note">
            No Redis, no second store, no hosted dependency. Point it at your own Postgres in
            production and nothing about it phones home.
          </p>
        </Section>

        <Section id="licence" className="wide licence" journey={journey} section="licence">
          <h2>Apache-2.0. The whole thing.</h2>
          <p className="lede">
            The spec, the engine, both renderers, the builder and the backend. No paywalled
            accessibility, no premium components, no clause that turns running it for your own
            users into distribution.
          </p>
          <div className="actions">
            <a className="action" href={REPO} rel="noreferrer noopener">
              github.com/sharkysan/formancy.ai
            </a>
          </div>
        </Section>

        <Finale journey={journey} />
      </main>

      <footer>
        <span>Apache-2.0</span>
        <a href={REPO} rel="noreferrer noopener">
          Source
        </a>
        <a href="/docs">Documentation</a>
        <span className="spacer">Spec version 2 · packages 0.1.0, pre-alpha</span>
      </footer>

      <Panel journey={journey} />
    </>
  )
}

/**
 * The light behind the page.
 *
 * Three slow washes of the two channel colours and a grid that fades out from
 * the top — drawn with gradients and moved with `transform` only, so the
 * compositor animates them and the main thread never hears about it. Purely
 * decorative, and gone entirely under reduced motion except as a still.
 */
function Backdrop(): ReactElement {
  return (
    <div className="backdrop" aria-hidden="true">
      <i className="aurora a1" />
      <i className="aurora a2" />
      <i className="aurora a3" />
      <i className="grid" />
      <i className="grain" />
    </div>
  )
}

/**
 * What it is built with and for, going by.
 *
 * The list is read once by assistive technology; the copy that makes the loop
 * seamless is hidden from it, because hearing every name twice helps nobody.
 */
function Marquee(): ReactElement {
  const items = [
    'React 19',
    'Angular, zoneless',
    'PostgreSQL',
    'Docker',
    'CEL expressions',
    'Model Context Protocol',
    'Claude Code',
    'WCAG 2.2',
    'Strict CSP',
    'OpenAPI',
    'Apache-2.0',
  ]
  return (
    <div className="marquee">
      <ul aria-label="Built with and for">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <ul aria-hidden="true">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The live examples, one at a time.
 *
 * A real tab strip: arrow keys move between examples, and only the selected
 * tab is in the tab order. Each example keeps its own engine for the life of
 * the page, so switching away and back does not throw away what somebody
 * typed.
 */
function Examples(): ReactElement {
  const [selected, setSelected] = useState(0)
  const tabs = useRef<Array<HTMLButtonElement | null>>([])

  const engines = useMemo<readonly FormEngine[]>(
    () =>
      EXAMPLES.map((example) =>
        createFormEngine({
          schema: example.schema,
          capabilities: {
            now: () => Date.now(),
            today: () => new Date().toISOString().slice(0, 10),
            random: () => Math.random(),
          },
        }),
      ),
    [],
  )

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const next = (selected + step + EXAMPLES.length) % EXAMPLES.length
    setSelected(next)
    tabs.current[next]?.focus()
  }

  const example = EXAMPLES[selected] ?? EXAMPLES[0]
  const engine = engines[selected] ?? engines[0]
  if (example === undefined || engine === undefined) throw new Error('No examples')

  return (
    <div className="examples">
      <div className="picker" role="tablist" aria-label="Examples" onKeyDown={onKeyDown}>
        {EXAMPLES.map((each, index) => (
          <button
            key={each.id}
            ref={(node) => {
              tabs.current[index] = node
            }}
            type="button"
            role="tab"
            id={`example-tab-${each.id}`}
            aria-selected={index === selected}
            aria-controls={`example-${each.id}`}
            tabIndex={index === selected ? 0 : -1}
            onClick={() => setSelected(index)}
          >
            {each.title}
          </button>
        ))}
      </div>

      <div
        className="demo"
        role="tabpanel"
        id={`example-${example.id}`}
        aria-labelledby={`example-tab-${example.id}`}
      >
        <FormancyProvider engine={engine} key={example.id}>
          <div className="demo-code">
            <div className="window">
              <header>
                <span className="lights" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                {example.file}
              </header>
              <pre className="code">{highlight(sourceOf(example.schema))}</pre>
            </div>
            <div className="window rules-window">
              <header>
                <span className="dot live" aria-hidden="true" />
                rules, evaluated live
              </header>
              <LiveRules rules={example.schema.logic?.rules ?? []} />
            </div>
          </div>

          <div className="window form-window" data-formancy-theme="dusk">
            <header>
              <span className="dot" aria-hidden="true" />
              rendered by @formancy/react
            </header>
            <p className="hint">{example.hint}</p>
            <div className="sheet">
              {/* The file fields want somewhere to put bytes before they will
                  accept one. This page has no server, so the uploader keeps
                  them here and says so. */}
              <UploaderProvider value={demoUploader}>
                <FormancyForm layout="web" onSubmit={() => undefined} />
              </UploaderProvider>
            </div>
          </div>
        </FormancyProvider>
      </div>
    </div>
  )
}

/**
 * What the product does besides render, in one grid.
 *
 * Each card names something that is built and tested, not planned — the
 * roadmap is where the plans live. The light that follows the pointer is a
 * pair of custom properties set on the card under it; nothing re-renders.
 */
function Features(): ReactElement {
  const follow = (event: PointerEvent<HTMLDivElement>): void => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('.card')
    if (card === null) return
    const box = card.getBoundingClientRect()
    card.style.setProperty('--x', `${String(event.clientX - box.left)}px`)
    card.style.setProperty('--y', `${String(event.clientY - box.top)}px`)
  }

  const cards: ReadonlyArray<{ title: string; body: string; icon: ReactNode; wide?: boolean }> = [
    {
      title: 'Validated twice, written once',
      body: 'The browser shows the error, the server replays the submission through the same compiled graph and recomputes every calculated value itself. Nothing the client claims is trusted.',
      icon: <IconShield />,
      wide: true,
    },
    {
      title: 'Logic in CEL',
      body: 'Visibility, requiredness, totals and checks — type-checked when the form is saved, evaluated without eval under a strict CSP.',
      icon: <IconBranch />,
    },
    {
      title: 'Versions that never lie',
      body: 'Every submission is bound to the exact version that produced it. A change is diffed as compatible, lossy or breaking before it ships.',
      icon: <IconLayers />,
    },
    {
      title: 'Files, claimed in a transaction',
      body: 'Uploads are bound to their submission in the same transaction that stores it, and only ever served as attachments.',
      icon: <IconFile />,
    },
    {
      title: 'Rich text, parsed not trusted',
      body: 'Formatted answers go through a parser into elements. Nothing is ever handed to innerHTML.',
      icon: <IconType />,
    },
    {
      title: 'An audit log that records reads',
      body: 'Who exported four thousand answers is the question that gets asked. The log answers it — and never contains the answers themselves.',
      icon: <IconEye />,
      wide: true,
    },
    {
      title: 'Webhooks from an outbox',
      body: 'Delivered from a transactional outbox, to an address the server resolved and checked itself.',
      icon: <IconSend />,
    },
  ]

  return (
    <div className="bento" onPointerMove={follow}>
      {cards.map((card) => (
        <article key={card.title} className={card.wide === true ? 'card wide-card' : 'card'}>
          <span className="card-icon" aria-hidden="true">
            {card.icon}
          </span>
          <h3>{card.title}</h3>
          <p>{card.body}</p>
        </article>
      ))}
    </div>
  )
}

/**
 * An agent session, as it actually goes.
 *
 * The error in the middle is the real message the MCP server returns for the
 * mistake a model makes most — `seats * 4` against a number field — and the
 * point of the section is that the agent is told before the form exists, not
 * a customer after.
 */
function Transcript(): ReactElement {
  return (
    <div className="window transcript">
      <header>
        <span className="lights" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        claude — formancy
      </header>
      <ol aria-label="An agent writing a form">
        <li className="t-cmd">
          <span className="prompt">$</span> claude mcp add formancy -- npx -y @formancy/mcp
        </li>
        <li className="t-you">
          <b>you</b> A signup form with a seat count and a monthly total at CHF 4 a seat.
        </li>
        <li className="t-tool">
          <b>validate_form</b>
        </li>
        <li className="t-err">
          <b>✕ monthly (computed)</b> no such overload: double * int. A number field holds a
          double — write 4 as 4.0.
        </li>
        <li className="t-tool">
          <b>validate_form</b>
        </li>
        <li className="t-ok">
          <b>✓</b> Valid, and every expression type-checks.
        </li>
        <li className="t-tool">
          <b>publish_form</b>
        </li>
        <li className="t-ok">
          <b>✓</b> Published · version 1
        </li>
      </ol>
    </div>
  )
}

/**
 * Measured numbers, not adjectives.
 *
 * The audience has been told "blazing fast" before and stopped believing it.
 * Every figure here is read off the repository, and the one worth the space is
 * the zero: no `eval` and no `new Function` anywhere in the shipped packages,
 * which is what lets a form run under a strict Content-Security-Policy with no
 * configuration at all. The rest are countable facts rather than claims.
 */
function Readings(): ReactElement {
  const readings: ReadonlyArray<{ value: string; lines: readonly [string, string] }> = [
    { value: '1', lines: ['engine, compiled once', 'and run in both places'] },
    { value: '0', lines: ['uses of eval, so it', 'runs under a strict CSP'] },
    { value: '15', lines: ['field types the', 'spec defines'] },
    { value: '7', lines: ['tools for your', 'coding agent'] },
    { value: '57', lines: ['decision records, each', 'naming what it cost'] },
  ]

  return (
    <dl className="readings">
      {readings.map((reading) => (
        <div className="reading" key={reading.value}>
          <dt>
            <b>{reading.value}</b>
          </dt>
          <dd>
            {reading.lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * The mark — the same one in the favicon and the browser tab.
 *
 * Inline rather than an `<img>`, so the stem and the arms take the page's own
 * accent tokens instead of hard-coding the two colours a second time. Hidden
 * from assistive technology: the wordmark beside it already says the name, and
 * hearing it twice helps nobody.
 */
function Mark(): ReactElement {
  return (
    <svg className="mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="18" fill="var(--inset)" />
      <rect className="stem" x="14" y="14" width="12" height="36" rx="6" />
      <rect className="arm" x="30" y="14" width="20" height="12" rx="6" />
      <rect className="arm" x="30" y="30" width="14" height="12" rx="6" />
    </svg>
  )
}

/** A section that reports itself as read once it is genuinely being looked at. */
function Section({
  id,
  className,
  section,
  journey,
  children,
}: {
  id: string
  className?: string
  section: string
  journey: ReturnType<typeof useJourney>
  children: ReactNode
}): ReactElement {
  return (
    <section id={id} className={className} data-section={section} ref={journey.register(section)}>
      {children}
    </section>
  )
}

/**
 * The hero's two planes.
 *
 * The document behind and what the engine makes of it in front, separated in
 * Z and converging as you scroll — the claim the page makes, in the one place
 * it is allowed to be loud. Presentational entirely: `aria-hidden`, because
 * the same words are already in the headline beside it.
 */
function Planes(): ReactElement {
  return (
    <div className="planes" aria-hidden="true">
      <div className="window plane-document">
        <header>
          <span className="lights">
            <i />
            <i />
            <i />
          </span>
          ticket.json
        </header>
        <pre className="code">
          {highlight(`{
  "model": { "fields": [
    { "key": "ticket", "type": "radio" },
    { "key": "workshops", "type": "selectboxes" },
    { "key": "total", "type": "number" }
  ]},
  "logic": { "rules": [
    { "target": "workshops", "kind": "visible",
      "cel": "ticket == 'pro'" },
    { "target": "total", "kind": "computed",
      "cel": "ticket == 'pro' ? 690.0 : 390.0" }
  ]}
}`)}
        </pre>
      </div>

      <div className="window plane-form">
        <header>
          <span className="dot server" />
          evaluated · browser and server alike
        </header>
        <dl className="verdicts">
          <div>
            <dt>ticket</dt>
            <dd>pro</dd>
          </div>
          <div className="on">
            <dt>workshops</dt>
            <dd>shown</dd>
          </div>
          <div className="on">
            <dt>total</dt>
            <dd>CHF 690</dd>
          </div>
        </dl>
      </div>

      <span className="chip chip-client">✓ checked in the browser</span>
      <span className="chip chip-server">✓ replayed on the server</span>
    </div>
  )
}

/**
 * The running submission.
 *
 * The page's conceit: reading it fills a form in. The panel is a real
 * submission shape rather than something shaped like one, which is what makes
 * the ending land instead of feeling like a trick.
 */
function Panel({ journey }: { journey: ReturnType<typeof useJourney> }): ReactElement | null {
  const count = Object.keys(journey.data).length
  if (count === 0) return null

  return (
    <aside className="panel" aria-label="What you have told us by reading this far">
      <header>
        <span className="dot" />
        submission
        <span className="meter">
          <i style={{ width: `${String(Math.round(journey.progress * 100))}%` }} />
        </span>
      </header>
      <pre>{JSON.stringify(journey.data, null, 2)}</pre>
      {journey.seen.has('finale') ? (
        <p className="sent">sent</p>
      ) : journey.complete ? (
        <p className="sent">ready to send</p>
      ) : null}
    </aside>
  )
}

/**
 * The end.
 *
 * One orchestrated moment rather than an effect per section: the submission
 * the visitor has been filling in without knowing goes to the server, and the
 * server answers. The stamp lands only once the section is actually reached,
 * so it is a payoff rather than something that happened off screen.
 */
function Finale({ journey }: { journey: ReturnType<typeof useJourney> }): ReactElement {
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!journey.seen.has('finale')) return
    // A beat, so the receipt is read before the stamp lands on it.
    const timer = setTimeout(() => setSent(true), 600)
    return () => clearTimeout(timer)
  }, [journey.seen])

  const body = {
    ...journey.data,
    readAt: 'the bottom of the page',
  }

  return (
    <section
      id="finale"
      className={sent ? 'finale wide sent' : 'finale wide'}
      data-section="finale"
      ref={journey.register('finale')}
    >
      <h2>You have been filling in a form.</h2>
      <p className="lede">
        Every section answered one field. The panel in the corner was a real submission the whole
        way down — the same shape the engine produces, built the same way.
      </p>

      <div className="receipt">
        <header>
          <span className="dot" />
          POST /f/visitors/submissions
        </header>
        <pre>{JSON.stringify(body, null, 2)}</pre>
        <div className={sent ? 'stamp landed' : 'stamp'}>201 Created</div>
      </div>

      <div className="seal" aria-hidden="true" />

      {/* Announced once, politely: somebody who cannot see the stamp land
          should still be told the page did the thing it was building to. */}
      <p role="status" className="note">
        {sent ? 'Accepted, and validated by the same engine that drew the form.' : ''}
      </p>

      <div className="actions">
        <a className="action primary" href={PLAYGROUND}>
          Open the playground
        </a>
        <a className="action" href={REPO} rel="noreferrer noopener">
          Read the source
        </a>
      </div>
    </section>
  )
}

/* Icons: one stroke weight, one grid, drawn here rather than fetched. */

function Icon({ children }: { children: ReactNode }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      {children}
    </svg>
  )
}

const IconShield = (): ReactElement => (
  <Icon>
    <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6L12 3Z" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </Icon>
)
const IconBranch = (): ReactElement => (
  <Icon>
    <circle cx="6" cy="5" r="2" />
    <circle cx="6" cy="19" r="2" />
    <circle cx="18" cy="8" r="2" />
    <path d="M6 7v10M18 10c0 4-6 3-12 7" />
  </Icon>
)
const IconLayers = (): ReactElement => (
  <Icon>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </Icon>
)
const IconFile = (): ReactElement => (
  <Icon>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5M9 14l2 2 4-4" />
  </Icon>
)
const IconType = (): ReactElement => (
  <Icon>
    <path d="M5 6V4h14v2M12 4v16M9 20h6" />
  </Icon>
)
const IconEye = (): ReactElement => (
  <Icon>
    <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)
const IconSend = (): ReactElement => (
  <Icon>
    <path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" />
  </Icon>
)
