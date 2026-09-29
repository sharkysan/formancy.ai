import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactElement, ReactNode } from 'react'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import {
  FormancyForm,
  FormancyProvider,
  RichTextEditorProvider,
  UploaderProvider,
} from '@formancy/react'
import { createRichTextEditor } from '@formancy/tiptap'
import '@formancy/themes/blueprint.css'
import '@formancy/themes/dusk.css'
import '@formancy/themes/paper.css'
import '@formancy/themes/pop.css'
import './site.css'
import './hero-studio.css'
import { EXAMPLES } from './examples.js'
import { demoUploader } from './demo-uploader.js'
import { LiveRules, highlight, sourceOf } from './source.js'
import { useJourney } from './use-journey.js'
import { HeroStudio } from './hero-studio.js'

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
            <p className="eyebrow">Visual form builder for Angular and React</p>
            <h1>
              <span className="glow">Build the form.</span>{' '}<span className="hero-payoff">Ship your product.</span>
            </h1>
            <p className="lede">
              From a simple signup to a multi-step application: build it visually, add rules,
              and make it yours. Embed your form in Angular or React with your own design system.
              Conditional questions, live validation and calculated totals are already part of
              the toolkit.
            </p>
            <div className="actions">
              <a className="action primary" href={PLAYGROUND}>
                Build your first form
              </a>
              <a className="action" href="#build">
                Explore example forms
              </a>
            </div>
            <p className="note">Open source. Apache-2.0. Optional backend on your infrastructure.</p>
          </div>

          <HeroStudio playground={PLAYGROUND} />
        </Section>

        <div className="product-path wide" aria-label="From idea to answers">
          <a href={PLAYGROUND}><span>01 / BUILD</span><strong>Your idea. A working form.</strong><i aria-hidden="true">↗</i></a>
          <a href="#stack"><span>02 / CONNECT</span><strong>Angular or React. Your style.</strong><i aria-hidden="true">↘</i></a>
          <a href="#run"><span>03 / COLLECT</span><strong>Your answers. Your infrastructure.</strong><i aria-hidden="true">↘</i></a>
        </div>

        <Marquee />

        <div className="wide readings-wrap">
          <Readings />
        </div>

        <Section id="engine" className="wide" journey={journey} section="engine">
          <p className="eyebrow">From editor to your application</p>
          <h2>Your next form starts in an editor.</h2>
          <p className="lede">
            Build a registration form, an application or an internal workflow. Choose the fields,
            arrange them into sections and pages, and decide when a question appears or becomes
            required. Your form is saved as JSON and rendered by native Angular or React
            components. With the formancy backend, the same rules also check incoming submissions.
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
              <h3>Guide people as they fill in the form</h3>
              <p>
                Show relevant questions, calculate totals and explain validation errors as people
                type. Define the rules once and use them in either framework.
              </p>
            </div>
            <div className="side server">
              <h3>Check answers before storing them</h3>
              <p>
                The optional backend checks submissions against the same form version and rules.
                It recalculates totals on the server, so changing a value in the browser cannot
                bypass those checks.
              </p>
            </div>
          </div>
        </Section>

        <Section id="build" className="wide" journey={journey} section="builder">
          <p className="eyebrow">Try the forms your users will see</p>
          <h2>Click an answer. Watch the form adapt.</h2>
          <p className="lede">
            Try these three interactive examples. Change an answer to reveal follow-up questions
            or update a total. Switch themes to see how the same form can fit different products.
            These examples use React; the same form definitions also work in Angular.
          </p>

          <Examples />

          <p className="note">
            Nothing here is sent anywhere — the page is a static site, and a file you attach stays
            in this tab, which the submission says out loud rather than pretending otherwise.{' '}
            <a href={PLAYGROUND}>Open the form builder</a> to add and arrange fields yourself,
            then preview your form in React and Angular.
          </p>
        </Section>

        <Section id="features" className="wide" journey={journey} section="features">
          <p className="eyebrow">More than fields on a page</p>
          <h2>The hard parts of forms, already connected.</h2>
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
            Native Angular and React components. Your design system.
            <span className="depth" aria-hidden="true">
              <i />
            </span>
          </h2>
          <p className="lede">
            Use the same form definition in either framework. Start with a supplied theme or
            connect your own components and styles. React hooks and Angular signals integrate
            the form with your application; the shared engine handles its rules.
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

        {/* Side by side from 62rem. Both are supporting arguments rather than the
            page's claims, and stacked full width they read as two more chapters of
            equal weight to the engine and the builder above them. */}
        <div className="duo">
          <Section id="access" className="wide" journey={journey} section="access">
            <p className="eyebrow">Accessibility</p>
            <h2>Edit forms with a mouse or a keyboard.</h2>
            <p className="lede">
              Add, move and arrange fields without dragging. The editor offers keyboard controls
              and undo, while the rendered forms connect labels, descriptions and validation errors
              for assistive technology. Both renderers are checked by the same accessibility tests.
            </p>

            <div className="keys">
              <kbd>a</kbd>
              <span>add a field, a row, a column or a section</span>
              <kbd>m</kbd>
              <span>move the focused one, choosing from destinations read as sentences</span>
              <kbd>u</kbd>
              <span>unwrap a row, a group or a page, keeping the questions inside it</span>
              <kbd>Ctrl&nbsp;+&nbsp;Z</kbd>
              <span>undo, over a document model rather than over the DOM</span>
            </div>
          </Section>

          <Section id="run" className="wide" journey={journey} section="host">
            <p className="eyebrow">Self-hosted</p>
            <h2>Keep forms and submissions on your infrastructure.</h2>
            <p className="lede">
              Add the optional formancy backend when you need to store submissions, let people
              resume drafts, export answers to CSV or notify other systems through webhooks.
              Run it with Docker and PostgreSQL. Each submission keeps its form version, and the
              audit log records who accessed the data.
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
        </div>

        <Section id="licence" className="wide licence" journey={journey} section="licence">
          <div className="licence-claim">
            <p className="eyebrow">Licence</p>
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
          </div>

          {/* What the licence actually gives, beside the claim rather than under it: the
              section was a centred paragraph with a screen of air around it, and the three
              things below are the reason Apache-2.0 was chosen over MIT rather than
              decoration. */}
          <dl className="licence-terms">
            <div>
              <dt>An express patent grant</dt>
              <dd>
                With a retaliation clause, which is the term an acquirer&rsquo;s open-source
                office looks for first. MIT has none.
              </dd>
            </div>
            <div>
              <dt>Running it is not distributing it</dt>
              <dd>
                Offering a form to your own users triggers nothing. No source disclosure, no
                obligation that arrives with your first visitor.
              </dd>
            </div>
            <div>
              <dt>Attribution that travels</dt>
              <dd>
                A NOTICE file ships in every package, and the licence text with it — checked
                before a release can publish.
              </dd>
            </div>
          </dl>

          {/* The paragraph a buyer with a regulator behind them is looking for, and the
              disclaimer is half of it rather than a hedge on it: conformity attaches to a
              device with an intended purpose, a component cannot have one, and a supplier
              who claims otherwise is the one to be suspicious of. The two halves travel
              together -- `apps/docs/src/claims.test.ts` fails if either is left behind,
              and if a document named here is not where the link says. */}
          <p className="licence-provenance">
            <strong>Built to be incorporated.</strong> formancy is not a medical device and
            claims no conformity. It ships the characterisation a manufacturer needs under
            IEC 62304 to treat it as software of known provenance — a{' '}
            <a href={`${REPO}/blob/main/docs/regulatory/SOUP-DECLARATION.md`} rel="noreferrer noopener">
              SOUP declaration
            </a>
            , a{' '}
            <a href={`${REPO}/blob/main/docs/regulatory/SAFETY-ANALYSIS.md`} rel="noreferrer noopener">
              safety analysis
            </a>
            , the{' '}
            <a href={`${REPO}/blob/main/docs/regulatory/LIFECYCLE.md`} rel="noreferrer noopener">
              lifecycle
            </a>{' '}
            and the{' '}
            <a href={`${REPO}/tree/main/docs/decisions`} rel="noreferrer noopener">
              design rationale
            </a>{' '}
            — as an input to your risk analysis, not a substitute for it.
          </p>
        </Section>

        <Finale journey={journey} />
      </main>

      <footer>
        <span>Apache-2.0</span>
        <a href={REPO} rel="noreferrer noopener">
          Source
        </a>
        <a href="/docs">Documentation</a>
        <span className="spacer">{`Spec version 2 · packages ${__PACKAGE_VERSION__}, beta`}</span>
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
/**
 * The themes the live form can be shown in — the same markup, four products.
 *
 * Switching one changes one attribute on the sheet and nothing else: no
 * remount, no new engine, so what somebody typed stays typed. That is the
 * headless claim, made where a visitor can press a button and watch it.
 */
const FORM_THEMES = [
  { id: 'dusk', label: 'Dusk' },
  { id: 'blueprint', label: 'Blueprint' },
  { id: 'pop', label: 'Pop' },
  { id: 'paper', label: 'Paper' },
] as const

type FormTheme = (typeof FORM_THEMES)[number]['id']

function Examples(): ReactElement {
  const [selected, setSelected] = useState(0)
  const [theme, setTheme] = useState<FormTheme>('dusk')
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

          <div className="window form-window">
            <header>
              <span className="dot" aria-hidden="true" />
              <span className="form-window-title">rendered by @formancy/react</span>
              <span className="themes" role="group" aria-label="Theme">
                {FORM_THEMES.map((each) => (
                  <button
                    key={each.id}
                    type="button"
                    aria-pressed={theme === each.id}
                    onClick={() => setTheme(each.id)}
                  >
                    {each.label}
                  </button>
                ))}
              </span>
            </header>
            <p className="hint">{example.hint}</p>
            <div className="sheet" data-formancy-theme={theme}>
              {/* The file fields want somewhere to put bytes before they will
                  accept one. This page has no server, so the uploader keeps
                  them here and says so. */}
              {/* Both host-supplied capabilities the fields need: somewhere to
                  put bytes, and a WYSIWYG surface for the richtext field. The
                  bug-report example has one, and without this it would show the
                  textarea fallback here while the docs describe an editor. */}
              <UploaderProvider value={demoUploader}>
                <RichTextEditorProvider value={createRichTextEditor}>
                  <FormancyForm layout="web" onSubmit={() => undefined} />
                </RichTextEditorProvider>
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
      title: 'The builder is open source, too.',
      body: 'The visual editor, Angular and React renderers, and optional backend are all Apache-2.0. Build on the whole stack, with source code you can inspect, adapt and host yourself.',
      icon: <IconFile />,
      wide: true,
    },
    {
      title: 'Your forms evolve. Answers keep their context.',
      body: 'Each submission keeps the exact form version used to collect it. Review whether an update is compatible, loses information or breaks existing forms before publishing.',
      icon: <IconLayers />,
    },
    {
      title: 'Two frameworks. One tested contract.',
      body: 'Use the same form definition in Angular and React. Both native renderers run through the same behaviour and accessibility test suite, so support for both is continuously checked.',
      icon: <IconBranch />,
    },
    {
      title: 'Catch broken rules before your users do.',
      body: 'Publishing checks the form structure and expressions, catching invalid references, cycles and supported type errors before the form goes live. The same checks help validate forms written by coding agents.',
      icon: <IconShield />,
    },
    {
      title: 'Your components. Your design system.',
      body: 'Go beyond changing colours. Connect your own field components and styles, or start with a supplied theme. Keep the form integrated with your product while the shared engine handles its rules.',
      icon: <IconType />,
    },
    {
      title: 'Accessibility built in. Continuously checked.',
      body: 'Designed with WCAG 2.2 in mind: keyboard editing, connected labels, help text and error messages. Both renderers undergo automated accessibility checks. Your finished form still needs review with its own components, colours and content.',
      icon: <IconEye />,
      wide: true,
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
    { value: String(__FIELD_TYPES__), lines: ['field types the', 'spec defines'] },
    { value: '7', lines: ['tools for your', 'coding agent'] },
    { value: String(__DECISION_RECORDS__), lines: ['decision records, each', 'naming what it cost'] },
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
 * The running submission.
 *
 * The page's conceit: reading it fills a form in. The panel is a real
 * submission shape rather than something shaped like one, which is what makes
 * the ending land instead of feeling like a trick.
 */
function Panel({ journey }: { journey: ReturnType<typeof useJourney> }): ReactElement | null {
  const count = Object.keys(journey.data).length
  if (count === 0 || (journey.seen.size === 1 && journey.seen.has('hero'))) return null

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
      {/* The claim beside the evidence. Stacked, the receipt sat below the sentence
          describing it and the section ran to two screens; side by side, the words and
          the submission they are about are read together, which is the whole payoff. */}
      <div className="finale-words">
        <h2>You have been filling in a form.</h2>
        <p className="lede">
          Every section answered one field. The panel in the corner was a real submission the
          whole way down — the same shape the engine produces, built the same way.
        </p>

        {/* Announced once, politely: somebody who cannot see the stamp land should still
            be told the page did the thing it was building to. */}
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
      </div>

      <div className="finale-receipt">
        <div className="receipt">
          <header>
            <span className="dot" />
            POST /f/visitors/submissions
          </header>
          <pre>{JSON.stringify(body, null, 2)}</pre>
          <div className={sent ? 'stamp landed' : 'stamp'}>201 Created</div>
        </div>
        <div className="seal" aria-hidden="true" />
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
