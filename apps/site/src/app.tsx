import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { createFormEngine } from '@formancy/core'
import { FormancyForm, FormancyProvider, UploaderProvider } from '@formancy/react'
import '@formancy/themes/dusk.css'
import './site.css'
import { DEMO_SCHEMA, DEMO_SOURCE } from './demo-schema.js'
import { demoUploader } from './demo-uploader.js'
import { useJourney } from './use-journey.js'

/**
 * formancy.ai.
 *
 * The page makes one argument and is shaped like it: the same engine runs in
 * the browser and on the server, so the two cannot disagree about whether a
 * submission is valid. Violet is the browser and teal is the server
 * throughout, and they appear together only where that pairing is the point.
 *
 * The form halfway down is real — a formancy document handed to
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

  const engine = useMemo(
    () =>
      createFormEngine({
        schema: DEMO_SCHEMA,
        capabilities: {
          now: () => Date.now(),
          today: () => new Date().toISOString().slice(0, 10),
          random: () => Math.random(),
        },
      }),
    [],
  )

  return (
    <>
      <a className="skip" href="#start">
        Skip to content
      </a>

      <header className="bar">
        <strong>formancy.ai</strong>
        <nav>
          <a className="optional" href="#engine">
            How it works
          </a>
          <a className="optional" href="#build">
            Build
          </a>
          <a className="optional" href="#run">
            Run it
          </a>
          <a href={PLAYGROUND}>Playground</a>
          <a href={REPO} rel="noreferrer noopener">
            GitHub
          </a>
        </nav>
        <div className="rail" aria-hidden="true" />
      </header>

      <main className="page" id="start">
        <Section id="hero" className="hero wide" journey={journey} section="hero">
          <h1>One engine, running in the browser and on the server.</h1>
          <p className="lede">
            A form is a JSON document. formancy compiles it once and evaluates it in both places,
            so what the person filling it in was told and what the server accepts cannot drift
            apart.
          </p>
          <div className="actions">
            <a className="action primary" href="#build">
              See it build a form
            </a>
            <a className="action" href={REPO} rel="noreferrer noopener">
              Read the source
            </a>
          </div>

          <Planes />
        </Section>

        <Section id="engine" className="wide" journey={journey} section="engine">
          <h2>The same rule, twice, is two rules.</h2>
          <p className="lede" style={{ marginBlockStart: '1.25rem' }}>
            Most form platforms validate in the browser with one implementation and on the server
            with another. They agree until they don&rsquo;t, and the day they stop is the day
            somebody&rsquo;s order is accepted by one and rejected by the other.
          </p>

          <div className="mirror">
            <div>
              <b>Browser</b>
              <span className="expr">plan == &apos;cloud&apos;</span>
            </div>
            <div>
              <b>Server</b>
              <span className="expr">plan == &apos;cloud&apos;</span>
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

        <Section id="renderers" className="wide" journey={journey} section="renderers">
          <h2>Your markup. Both frameworks. One behaviour.</h2>
          <p className="lede" style={{ marginBlockStart: '1.25rem' }}>
            React hooks on one side, Angular signals on the other, over the same protocol. Neither
            is a wrapper around the other, and neither ships a stylesheet: every id and ARIA
            attribute comes from the engine, so the two cannot wire a form up differently.
          </p>

          <div className="pair">
            <div className="side">
              <h3>@formancy/react</h3>
              <p>
                <code>useSyncExternalStore</code> over identity-stable snapshots. A keystroke
                re-renders one field, not the form.
              </p>
            </div>
            <div className="side">
              <h3>@formancy/angular</h3>
              <p>
                Zoneless, one signal per field, set exactly when the engine says that field
                changed. No <code>zone.js</code>, no whole-form change detection.
              </p>
            </div>
          </div>

          <p className="note" style={{ marginBlockStart: '2rem' }}>
            Both are held to one published conformance suite. A renderer that behaves differently
            fails it — including a renderer somebody else writes.
          </p>
        </Section>

        <Section id="build" className="wide" journey={journey} section="builder">
          <h2>A document on the left. A working form on the right.</h2>
          <p className="lede" style={{ marginBlockStart: '1.25rem' }}>
            This one is live. Choose the managed plan and watch a field appear, because the
            document says it should. The second tab holds the types spec 2 added: tick boxes
            whose answer is a list, formatted text that is parsed rather than trusted, and an
            attachment.
          </p>

          <div className="demo">
            <div className="plane">
              <header>
                <span className="dot" />
                quote.json
              </header>
              <pre>{DEMO_SOURCE}</pre>
            </div>

            <div className="plane" data-formancy-theme="dusk">
              <header>
                <span className="dot" />
                rendered by @formancy/react
              </header>
              <div className="sheet">
                <FormancyProvider engine={engine}>
                  {/* The file field wants somewhere to put bytes before it
                      will accept one. This page has no server, so the
                      uploader keeps them here and says so. */}
                  <UploaderProvider value={demoUploader}>
                    <FormancyForm layout="web" onSubmit={() => undefined} />
                  </UploaderProvider>
                </FormancyProvider>
              </div>
            </div>
          </div>

          <p className="note" style={{ marginBlockStart: '1.75rem' }}>
            Nothing here is sent anywhere — the page is a static site, and a file you attach
            stays in this tab, which the submission says out loud rather than pretending
            otherwise.{' '}
            <a href={PLAYGROUND}>Open the playground</a> to edit the document itself and watch
            React and Angular render the same change.
          </p>
        </Section>

        <Section id="access" className="wide" journey={journey} section="access">
          <h2>Built by keyboard, before it was built by mouse.</h2>
          <p className="lede" style={{ marginBlockStart: '1.25rem' }}>
            WCAG 2.2 requires every drag to have an equivalent that is not a drag. The builder&rsquo;s
            keyboard path was written first, and the drag surfaces call the same commands — which
            is the only order that leaves the keyboard path finished.
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

          <p className="note" style={{ marginBlockStart: '2rem' }}>
            The conformance drivers may only find controls by role and accessible name. A renderer
            whose markup a screen reader cannot reach is a renderer no test can drive.
          </p>
        </Section>

        <Section id="run" className="wide" journey={journey} section="host">
          <h2>It is a container and a database.</h2>
          <p className="lede" style={{ marginBlockStart: '1.25rem' }}>
            Submissions bound immutably to the schema version that produced them, drafts that
            migrate on resume, CSV export unioned across versions, and webhooks delivered from a
            transactional outbox to an address the server resolved and checked itself.
          </p>

          <div className="terminal">
            <pre>
              <span className="prompt">$</span> docker compose up -d{'\n'}
              <span className="out">
                postgres on :5439 · formancy on :4380 · admin on :4382
              </span>
            </pre>
          </div>

          <p className="note" style={{ marginBlockStart: '1.5rem' }}>
            No Redis, no second store, no hosted dependency. Point it at your own Postgres in
            production and nothing about it phones home.
          </p>
        </Section>

        <Section id="licence" className="wide" journey={journey} section="licence">
          <h2>Apache-2.0. The whole thing.</h2>
          <p className="lede" style={{ marginBlockStart: '1.25rem' }}>
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
 * The document behind and the form in front, separated in Z and converging as
 * you scroll — the claim the page makes, in the one place it is allowed to be
 * loud. Presentational entirely: `aria-hidden`, because the same words are
 * already in the headline above it and reading them twice helps nobody.
 */
function Planes(): ReactElement {
  return (
    <div className="planes" aria-hidden="true">
      <div className="plane plane-document">
        <header>
          <span className="dot" />
          contact.json
        </header>
        <pre>{`{
  "specVersion": "2",
  "model": { "fields": [
    { "key": "email", "type": "text", "required": true },
    { "key": "topics", "type": "selectboxes" }
  ]},
  "logic": { "rules": [
    { "target": "topics", "kind": "visible", "cel": "email != ''" }
  ]}
}`}</pre>
      </div>

      <div className="plane plane-form server">
        <header>
          <span className="dot" />
          the same document, evaluated
        </header>
        <pre>{`email     required, not yet answered
topics    hidden — email != '' is false

submit    refused, browser and server alike`}</pre>
      </div>
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
  const region = useRef<HTMLDivElement | null>(null)

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
      className="finale wide"
      data-section="finale"
      ref={journey.register('finale')}
    >
      <h2>You have been filling in a form.</h2>
      <p className="lede">
        Every section answered one field. The panel in the corner was a real submission the whole
        way down — the same shape the engine produces, built the same way.
      </p>

      <div className="receipt" ref={region}>
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
      <p role="status" className="note" style={{ marginBlockStart: '1.5rem' }}>
        {sent ? 'Accepted, and validated by the same engine that drew the form.' : ''}
      </p>

      <div className="actions" style={{ justifyContent: 'center' }}>
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
