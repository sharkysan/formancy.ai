import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import Editor, { useMonaco } from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import { createFormEngine, parsePath } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import { validateSchema } from '@formancy/spec/validate'
import type { SchemaError } from '@formancy/spec/validate'
import formancySchemaJson from '@formancy/spec/schema.json'
import type { FormSchema } from '@formancy/spec'
import {
  ErrorSummary,
  FormancyForm,
  FormancyProvider,
  RichTextEditorProvider,
  OptionsSourcesProvider,
  ScannerProvider,
  UploaderProvider,
} from '@formancy/react'
import { createRichTextEditor } from '@formancy/tiptap'
import { playgroundUploader } from './demo-uploader.js'
import { DEMO_OPTIONS_SOURCES, DEMO_SCANNER } from './demo-capabilities.js'
import { createBuilderSession } from '@formancy/builder-core'
import type { BuilderSession } from '@formancy/builder-core'
import {
  FormancyArrangeSurface,
  FormancyBuilder,
  FormancyLayoutPane,
  LayoutPropertyPanel,
  LogicPanel,
  PropertyPanel,
  useBuilder,
} from '@formancy/builder-react'
import '@formancy/themes/blueprint.css'
import '@formancy/themes/dusk.css'
import '@formancy/themes/pop.css'
import '@formancy/themes/paper.css'
import '@formancy/themes/workbench.css'
import './app.css'
import { STARTER_SCHEMA } from './starter.js'
import { WIZARD_SCHEMA } from './wizard.js'
import { AngularPane } from './angular-pane.js'
import { PLAYGROUND_CHECKS } from './demo-checks.js'

/**
 * The playground: the whole thesis on one screen. A schema on the left, the
 * live rendered form in the middle, the engine's actual state on the right.
 *
 * The theme switcher is not decoration. The renderers ship no CSS, and the four
 * themes are scoped stylesheets over the same `data-formancy-part` hooks — so
 * switching between them, live, with no remount and no component change, is
 * the claim being demonstrated rather than asserted.
 */
/**
 * The two demo documents, and why there are two.
 *
 * The starter is one flat form on purpose — every field type the spec defines
 * **minus the two that nest** — so every control a visitor might want to try is
 * on screen at once, with nothing to press Next through. The cost of that was
 * invisible until somebody asked for a demo of the wizard work: this page held no
 * `page` and no `group` at all, so it never drew a stepper, never showed a step
 * being walked past, and gave the builder's container commands nothing to act on.
 *
 * Adding a page to the starter would have taken away the thing that makes it
 * work, to demonstrate a page. So the obligation is on the pair, and
 * `wizard.test.ts` holds it there: between the two of them, every field type and
 * every rule kind the format defines is on screen somewhere, derived from the
 * spec's own lists rather than from a list here that would go stale.
 */
const DEMOS = [
  { id: 'starter', label: 'Everything — one form, every field type', schema: STARTER_SCHEMA },
  { id: 'wizard', label: 'A wizard — steps, a group, a skipped page', schema: WIZARD_SCHEMA },
] as const

type DemoId = (typeof DEMOS)[number]['id']

const THEMES = [
  { id: 'blueprint', label: 'Blueprint — light, technical' },
  { id: 'dusk', label: 'Dusk — dark, rounded' },
  { id: 'pop', label: 'Pop — loud, playful' },
  { id: 'paper', label: 'Paper — quiet, editorial' },
] as const

type ThemeId = (typeof THEMES)[number]['id']

/**
 * The locales the starter schema carries. French is deliberately incomplete,
 * so switching to it shows the fallback doing its job: three labels stay
 * English rather than turning into message ids.
 */
const LOCALES = [
  { id: 'en', label: 'English' },
  { id: 'de', label: 'Deutsch' },
  { id: 'fr', label: 'Français — partly translated' },
] as const

type LocaleId = (typeof LOCALES)[number]['id']

const REPO = 'https://github.com/sharkysan/formancy.ai'

/**
 * Where the landing page lives — the way back from here.
 *
 * One origin in production, where the site is at `/` and this app at
 * `/playground/`; two Vite servers in development, where a relative path would
 * land on the playground's own root. The same reasoning, mirrored, as the
 * site's link to this page.
 */
const SITE = import.meta.env.DEV ? 'http://localhost:4384/' : '/'

/**
 * The playground's stand-in for a camera.
 *
 * `widget: "scanner"` needs a host to supply the camera, the permission prompt and the
 * decoder, because no renderer may own any of the three
 * ([0071](https://github.com/sharkysan/formancy.ai/blob/main/docs/decisions/0071-a-scanner-is-supplied-not-built.md)).
 * This page has none of them and is not going to grow a decoder to demonstrate a
 * widget, so it supplies the honest version: a prompt, exactly as the rich-text link
 * button asks for an address rather than building a dialog this project would then own
 * the accessibility of.
 *
 * It demonstrates everything about the widget except the decoding — the button, its
 * name, the value landing in the engine, and the `pattern` refusing a scan the same way
 * it refuses typing. `window.prompt` even has the contract's own shape: a string, or
 * `null` when somebody cancels.
 */

/**
 * The three panes, for a screen too narrow to show them side by side.
 *
 * Stacked, each pane became a 320-pixel box with its own scrollbar inside a
 * page with another one — a form you could see four fields of at a time.
 * Narrow, the page shows one pane at a time at its full height instead, and
 * this chooses which. The form is first because it is what somebody came to
 * see. Wide, all three are shown and the switch is not.
 */
const PANES = [
  { id: 'form', label: 'Form' },
  { id: 'editor', label: 'Editor' },
  { id: 'engine', label: 'Engine' },
] as const

type PaneId = (typeof PANES)[number]['id']

export function App() {
  const [demo, setDemo] = useState<DemoId>('starter')
  const [source, setSource] = useState(() => JSON.stringify(STARTER_SCHEMA, null, 2))
  const [theme, setTheme] = useState<ThemeId>('blueprint')
  const [locale, setLocale] = useState<LocaleId>('en')
  const [pane, setPane] = useState<'build' | 'schema'>('build')
  /**
   * The builder session lives up here, not inside the Build pane, because the
   * PREVIEW is a drop target too and a drop has to reach the same session the
   * tree edits. Two sessions over one document would be two documents.
   */
  const [session, setSession] = useState<BuilderSession | null>(null)
  const [builderTab, setBuilderTab] = useState<'fields' | 'arrangement'>('fields')
  const [shown, setShown] = useState<PaneId>('form')

  // Opened when the Build pane appears, from whatever the text says then, and
  // again when a different demo is loaded.
  //
  // Deliberately not re-opened as `source` changes in general: the builder writes
  // it on every edit, and re-opening each time would throw the undo stack away.
  // A demo switch is the one case where throwing it away is right, because it is
  // a different document rather than an edit to this one — without `demo` in the
  // dependencies the form followed the picker and the structure tree did not,
  // which is two panes showing two documents on the page whose whole claim is
  // that they cannot.
  useEffect(() => {
    if (pane !== 'build') {
      setSession(null)
      return
    }
    try {
      setSession(createBuilderSession(JSON.parse(source) as FormSchema))
    } catch {
      // createBuilderSession refuses an invalid document on purpose, so a
      // half-typed schema sends you back to the text rather than into a
      // builder that cannot explain itself.
      setSession(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane, demo])

  const monaco = useMonaco()
  if (monaco !== null) {
    // The loader's bundled types stub `languages.json` as deprecated; at
    // runtime the namespace is there. One structural cast at the boundary.
    const json = (
      monaco.languages as unknown as {
        json: { jsonDefaults: { setDiagnosticsOptions(options: object): void } }
      }
    ).json
    json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      schemas: [
        {
          uri: 'https://formancy.dev/schema/0/formancy.schema.json',
          fileMatch: ['*'],
          schema: formancySchemaJson,
        },
      ],
    })
  }

  const parsed = useMemo(() => {
    try {
      return { document: JSON.parse(source) as unknown }
    } catch (error) {
      return { parseError: error instanceof Error ? error.message : String(error) }
    }
  }, [source])

  const validated = useMemo(() => {
    if (parsed.document === undefined) return undefined
    return validateSchema(parsed.document)
  }, [parsed])

  // A fresh engine per valid schema: the playground shows what a consumer
  // gets, and a consumer gets a new engine when the schema changes.
  const built = useMemo(() => {
    if (validated === undefined || !validated.valid) return undefined
    /*
     * One engine per renderer, from one schema, with its own id namespace.
     *
     * Not a shared instance, and not an oversight. Element ids are minted from
     * the form id — `f:everything:email:control` — so two renderers of one
     * schema on one page emit every id twice, and a duplicate id breaks exactly
     * the two things the engine mints them for: `<label for>` and
     * `aria-describedby` both resolve to the FIRST match in the document, which
     * here would be the other framework's. Each renderer is correct about its
     * own tree and neither can see the collision, which is why the engine takes
     * a `formId` rather than the renderers taking a prefix
     * ([0021](../../../docs/decisions/0021-engine-owns-aria.md)).
     *
     * The cost is that the two previews hold their own answers rather than
     * mirroring each other. That is the right trade for what this demonstrates:
     * the claim is that one engine build behaves identically under both
     * renderers, which is shown by filling the same field in each and getting
     * the same validation — not by one typing into the other.
     */
    const forRenderer = (formId: string) =>
      createFormEngine({
        schema: validated.schema,
        formId,
        // Fixed for the engine's lifetime, so switching locale rebuilds it —
        // which is exactly what the spec says must happen, because snapshots
        // are identity-stable and a locale moving under them would leave
        // every cached one stale.
        locale,
        capabilities: {
          now: () => Date.now(),
          today: () => new Date().toISOString().slice(0, 10),
          random: () => Math.random(),
        },
        // This tab is the deployment. A `check` names a validator and carries no
        // expression, so with nothing here a document naming one fails CLOSED:
        // the field shows an error the visitor cannot clear and nothing says that
        // the deployment, not the answer, is what is missing.
        checks: PLAYGROUND_CHECKS,
      })

    try {
      return { engine: forRenderer('react'), angular: forRenderer('angular') }
    } catch (error) {
      // validateSchema passed but the engine refused: an expression error or a
      // dependency cycle. Exactly what a form author needs to see verbatim.
      return { engineError: error instanceof Error ? error.message : String(error) }
    }
  }, [validated, locale])

  return (
    <div className="app">
      <div className="glow" aria-hidden="true" />

      <header className="bar">
        <a className="home" href={SITE}>
          <Mark />
          formancy.ai
        </a>
        <span className="crumb" aria-hidden="true">
          /
        </span>
        <h1>Playground</h1>
        <span className="note">Edit the schema; the form and the engine follow.</span>

        <div className="controls">
          <label className="switcher">
            Demo
            <select
              value={demo}
              onChange={(event) => {
                const chosen = DEMOS.find((option) => option.id === event.target.value)
                if (chosen === undefined) return
                setDemo(chosen.id)
                // The text IS the document here — the builder writes it on every
                // edit and everything else reads it — so loading a demo is setting
                // the text, and nothing else has to be told.
                setSource(JSON.stringify(chosen.schema, null, 2))
              }}
            >
              {DEMOS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="switcher">
            Language
            <select value={locale} onChange={(event) => setLocale(event.target.value as LocaleId)}>
              {LOCALES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="switcher">
            Theme
            <select value={theme} onChange={(event) => setTheme(event.target.value as ThemeId)}>
              {THEMES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <a className="repo" href={REPO} rel="noreferrer noopener">
          {/* Named, not an unlabelled icon: "GitHub" alone says which site,
              not which repository, and this page is the first thing anyone
              evaluating the project sees. On a phone the first two words are
              hidden visually and still read out. */}
          <span className="long">formancy.ai on </span>GitHub
        </a>
      </header>

      <nav className="show" aria-label="Pane">
        {PANES.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            aria-pressed={shown === candidate.id}
            aria-controls={`pane-${candidate.id}`}
            onClick={() => setShown(candidate.id)}
          >
            {candidate.label}
          </button>
        ))}
      </nav>

      <div className="panes" data-shown={shown}>
        <section className="pane editor" id="pane-editor">
          <h2>
            {(['build', 'schema'] as const).map((candidate) => (
              <button
                key={candidate}
                className="mode"
                aria-pressed={pane === candidate}
                onClick={() => setPane(candidate)}
              >
                {candidate === 'build' ? 'Build' : 'Schema'}
              </button>
            ))}
          </h2>
          <div className="body" hidden={pane !== 'build'}>
            {pane !== 'build' ? null : session === null ? (
              <p className="empty" style={{ padding: '1rem' }}>
                This schema cannot be opened in the builder yet. Fix it under Schema and come back.
              </p>
            ) : (
              <BuilderBody
                session={session}
                onChange={setSource}
                tab={builderTab}
                onTab={setBuilderTab}
              />
            )}
          </div>
          <div className="body schema" hidden={pane !== 'schema'}>
            <Editor
              language="json"
              value={source}
              onChange={(next) => setSource(next ?? '')}
              beforeMount={defineNightTheme}
              theme="formancy-night"
              options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 13,
                fontFamily: "'IBM Plex Mono', ui-monospace, Consolas, monospace",
                tabSize: 2,
              }}
            />
          </div>
        </section>

        <section className="pane preview" id="pane-form">
          <h2>Form</h2>
          <div className="body">
            {parsed.parseError !== undefined ? (
              <Problem title="Not valid JSON yet" detail={parsed.parseError} />
            ) : validated !== undefined && !validated.valid ? (
              <SchemaProblems errors={validated.errors} />
            ) : built?.engineError !== undefined ? (
              <Problem title="The engine refused this schema" detail={built.engineError} />
            ) : built?.engine !== undefined ? (
              // The same form, and — while the Arrangement tab is showing — a
              // drop target for it. Every drop goes through the same session
              // command the tree and the keyboard use, so the two views cannot
              // disagree: the drop edits the document, the document rewrites
              // the JSON, and the JSON rebuilds this engine.
              <FormancyArrangeSurface
                session={session ?? PLACEHOLDER_SESSION}
                layout="web"
                enabled={session !== null && pane === 'build' && builderTab === 'arrangement'}
              >
                <div className="renderers">
                  {/* The playground provides the editor, so the richtext
                      field here is the one a visitor would actually use rather
                      than the textarea fallback. `createRichTextEditor` matches
                      the factory interface exactly, which is the point of it
                      being an interface. */}
                  <RichTextEditorProvider value={createRichTextEditor}>
                    {/* And an uploader, and a scanner, for the same reason in both cases:
                        each control's real behaviour only exists where a host supplies the
                        capability, so a playground without them would show the fallback and
                        call it the feature. The uploader keeps the bytes in this tab and its
                        storage key says so. */}
                    <UploaderProvider value={playgroundUploader}>
                      <ScannerProvider value={DEMO_SCANNER}>
                      <OptionsSourcesProvider value={DEMO_OPTIONS_SOURCES}>
                      {/* A region with an accessible name, so a test — and a
                          screen reader moving by landmark — can say which
                          renderer it means. Two forms on one page otherwise give
                          every query two answers.

                          The themed sheet is per pane rather than around both:
                          the theme styles a FORM, and each renderer renders its
                          own. One sheet around the pair also capped the two at
                          the width written for one. */}
                      <section className="react-pane" aria-labelledby="renderer-react">
                        <h3 id="renderer-react">React</h3>
                        <div className="sheet" data-formancy-theme={theme}>
                          <FormancyProvider engine={built.engine} key={source}>
                            <ErrorSummary />
                            <FormancyForm layout="web" />
                          </FormancyProvider>
                        </div>
                      </section>
                      {/* The same document, under the other renderer. One engine
                          build, two framework-native bindings, side by side —
                          which is the project's central claim and was until now
                          only ever asserted. */}
                      <AngularPane engine={built.angular} theme={theme} />
                      </OptionsSourcesProvider>
                      </ScannerProvider>
                    </UploaderProvider>
                  </RichTextEditorProvider>
                </div>
              </FormancyArrangeSurface>
            ) : null}
          </div>
        </section>

        <section className="pane engine" id="pane-engine">
          <h2>Engine</h2>
          <div className="body inspect">
            {built?.engine !== undefined ? (
              <EngineInspector engine={built.engine} />
            ) : (
              <p className="empty">No engine — fix the schema first.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

/**
 * The JSON editor, in the page's colours.
 *
 * Monaco draws its own surface, so a dark workbench around the stock light
 * editor reads as two products glued together. Keys, strings and literals
 * take the same three colours the landing page gives them.
 */
function defineNightTheme(monaco: Monaco): void {
  monaco.editor.defineTheme('formancy-night', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'string.key.json', foreground: 'c3b9ff' },
      { token: 'string.value.json', foreground: '9ee8c9' },
      { token: 'number', foreground: 'ff9ecf' },
      { token: 'keyword.json', foreground: 'ff9ecf' },
    ],
    colors: {
      'editor.background': '#0b0f18',
      'editor.lineHighlightBackground': '#141a29',
      'editorLineNumber.foreground': '#3a445a',
      'editorLineNumber.activeForeground': '#95a0b4',
      'editorIndentGuide.background1': '#1b2233',
      'editor.selectionBackground': '#3b3470',
      'editorCursor.foreground': '#3fe0d5',
    },
  })
}

/**
 * The mark — the same one as the favicon and the landing page's bar. Hidden
 * from assistive technology: the link text beside it already says the name.
 */
function Mark() {
  return (
    <svg className="mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="18" fill="#0b0f18" />
      <rect className="stem" x="14" y="14" width="12" height="36" rx="6" />
      <rect className="arm" x="30" y="14" width="20" height="12" rx="6" />
      <rect className="arm" x="30" y="30" width="14" height="12" rx="6" />
    </svg>
  )
}

function Problem({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="problem">
      <h3>{title}</h3>
      <pre>{detail}</pre>
    </div>
  )
}

function SchemaProblems({ errors }: { errors: SchemaError[] }) {
  return (
    <div className="problem">
      <h3>{errors.length === 1 ? 'One thing to fix' : `${errors.length} things to fix`}</h3>
      <ul>
        {errors.map((error, index) => (
          <li key={index}>
            <code>{error.path}</code> {error.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

function EngineInspector({ engine }: { engine: FormEngine }) {
  const value = useSyncExternalStore(
    (onChange) => engine.subscribe(onChange),
    () => JSON.stringify(engine.value(), null, 2),
    () => JSON.stringify(engine.value(), null, 2),
  )
  const errors = useSyncExternalStore(
    (onChange) => engine.subscribe(onChange),
    () => engine.visibleErrors(),
    () => engine.visibleErrors(),
  )

  return (
    <div>
      <h3>Submission value</h3>
      <pre>{value}</pre>

      <h3>Errors a person can see</h3>
      {errors.length === 0 ? (
        <p className="empty">None — nothing invalid has been touched yet.</p>
      ) : (
        <ul>
          {errors.map((entry) => (
            <li key={entry.path}>
              {entry.path} <span className="code">{entry.codes.join(', ')}</span>
            </li>
          ))}
        </ul>
      )}

      <h3>Fields the engine is tracking</h3>
      <ul>
        {engine.fieldPaths().map((path) => {
          const hidden = !engine.getFieldSnapshot(parsePath(path)).visible
          return (
            <li key={path} className={hidden ? 'hidden-field' : undefined}>
              {path}
              {hidden ? <span className="tag">hidden</span> : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * The same builder the admin uses, over the same document the JSON editor
 * edits. Switching panes is not switching tools: the session is opened from
 * the current text and every edit writes it back, so the JSON is always what
 * the builder built and the builder always shows what the JSON says.
 */
/**
 * A session that exists only so the preview's drop surface has one to hold
 * while the document is unopenable. It is never enabled, so nothing reaches
 * it — and a component whose props go optional for one edge case grows two
 * code paths for the rest of its life.
 */
const PLACEHOLDER_SESSION: BuilderSession = createBuilderSession({
  specVersion: '1',
  id: 'placeholder',
  title: 'No form',
  model: { fields: [] },
})

function BuilderBody({
  session,
  onChange,
  tab,
  onTab,
}: {
  session: BuilderSession
  onChange: (next: string) => void
  tab: 'fields' | 'arrangement'
  onTab: (next: 'fields' | 'arrangement') => void
}) {
  const view = useBuilder(session)
  const [selected, setSelected] = useState<readonly string[] | null>(null)
  /** Which node the arrangement pane is on, so its property panel has something to show. */
  const [arranging, setArranging] = useState<readonly number[] | null>(null)

  useEffect(() => {
    onChange(JSON.stringify(view.document, null, 2))
  }, [view.document, onChange])

  const editing = selected ?? view.nodes[0]?.keyPath ?? null

  return (
    <div className="builder-pane">
      <div className="builder-tools">
        <button onClick={() => session.undo()} disabled={!view.canUndo}>
          Undo
        </button>
        <button onClick={() => session.redo()} disabled={!view.canRedo}>
          Redo
        </button>
        <span className="builder-tabs">
          {(['fields', 'arrangement'] as const).map((candidate) => (
            <button
              key={candidate}
              aria-pressed={tab === candidate}
              onClick={() => onTab(candidate)}
            >
              {candidate === 'fields' ? 'Fields' : 'Arrangement'}
            </button>
          ))}
        </span>
      </div>

      {tab === 'arrangement' ? (
        <>
          <FormancyLayoutPane session={session} layout="web" onSelect={setArranging} />

          {/* Until this existed, NO property of a layout node could be set from the
              builder at all: a table's `columns` and a section's `label` since the
              day layouts existed, and `span` from the moment the format grew it.
              The panel is generated from the JSON Schema, so the next one arrives
              with an editor rather than needing somebody to remember. */}
          {arranging === null ? null : (
            <LayoutPropertyPanel session={session} address={{ layout: 'web', path: arranging }} />
          )}
        </>
      ) : (
        <>
          {/* The tree reports which field it is on, rather than this app reading its
              DOM. What was here before took the focused row's POSITION among its
              siblings and indexed the flattened node list with it — right only while
              those two lists agree about nesting, which they stop doing the moment a
              container is collapsed. */}
          <FormancyBuilder session={session} onSelect={setSelected} />

          {editing === null ? null : (
            <>
              <PropertyPanel session={session} keyPath={editing} />
              <LogicPanel session={session} keyPath={editing} />
            </>
          )}
        </>
      )}
    </div>
  )
}
