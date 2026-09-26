import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import Editor, { useMonaco } from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import { createFormEngine, parsePath } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import { validateSchema } from '@formancy/spec/validate'
import type { SchemaError } from '@formancy/spec/validate'
import formancySchemaJson from '@formancy/spec/schema.json'
import type { FormSchema } from '@formancy/spec'
import { ErrorSummary, FormancyForm, FormancyProvider, RichTextEditorProvider } from '@formancy/react'
import { createRichTextEditor } from '@formancy/tiptap'
import { createBuilderSession } from '@formancy/builder-core'
import type { BuilderSession } from '@formancy/builder-core'
import {
  FormancyArrangeSurface,
  FormancyBuilder,
  FormancyLayoutPane,
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

/**
 * The playground: the whole thesis on one screen. A schema on the left, the
 * live rendered form in the middle, the engine's actual state on the right.
 *
 * The theme switcher is not decoration. The renderers ship no CSS, and the four
 * themes are scoped stylesheets over the same `data-formancy-part` hooks — so
 * switching between them, live, with no remount and no component change, is
 * the claim being demonstrated rather than asserted.
 */
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

  // Opened when the Build pane appears, from whatever the text says then.
  // Deliberately not re-opened as `source` changes: the builder writes it on
  // every edit, and re-opening each time would throw the undo stack away.
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
  }, [pane])

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
    try {
      return {
        engine: createFormEngine({
          schema: validated.schema,
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
        }),
      }
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
                <div className="sheet" data-formancy-theme={theme}>
                  {/* The playground provides the editor, so the richtext
                      field here is the one a visitor would actually use rather
                      than the textarea fallback. `createRichTextEditor` matches
                      the factory interface exactly, which is the point of it
                      being an interface. */}
                  <RichTextEditorProvider value={createRichTextEditor}>
                    <FormancyProvider engine={built.engine} key={source}>
                      <ErrorSummary />
                      <FormancyForm layout="web" />
                    </FormancyProvider>
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
        // Outside the focus-capture wrapper below on purpose: that one reads
        // a tree item's position as an index into the MODEL, and a layout node
        // at the same position is a different thing entirely.
        <FormancyLayoutPane session={session} layout="web" />
      ) : (
        <>
          <div
            onFocusCapture={(event) => {
              const item = (event.target as HTMLElement).closest('[role="treeitem"]')
              const at = item === null ? -1 : [...(item.parentElement?.children ?? [])].indexOf(item)
              const node = at < 0 ? undefined : view.nodes[at]
              if (node !== undefined) setSelected(node.keyPath)
            }}
          >
            <FormancyBuilder session={session} />
          </div>

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
