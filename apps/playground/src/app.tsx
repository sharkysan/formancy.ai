import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import Editor, { useMonaco } from '@monaco-editor/react'
import { createFormEngine, parsePath } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import { validateSchema } from '@formancy/spec/validate'
import type { SchemaError } from '@formancy/spec/validate'
import formancySchemaJson from '@formancy/spec/schema.json'
import { ErrorSummary, FormancyForm, FormancyProvider } from '@formancy/react'
import { createBuilderSession } from '@formancy/builder-core'
import { FormancyBuilder, PropertyPanel, useBuilder } from '@formancy/builder-react'
import '@formancy/themes/blueprint.css'
import '@formancy/themes/dusk.css'
import '@formancy/themes/workbench.css'
import './app.css'
import { STARTER_SCHEMA } from './starter.js'

/**
 * The playground: the whole thesis on one screen. A schema on the left, the
 * live rendered form in the middle, the engine's actual state on the right.
 *
 * The theme switcher is not decoration. The renderers ship no CSS, and the two
 * themes are scoped stylesheets over the same `data-formancy-part` hooks — so
 * switching between them, live, with no remount and no component change, is
 * the claim being demonstrated rather than asserted.
 */
const THEMES = [
  { id: 'blueprint', label: 'Blueprint — light, technical' },
  { id: 'dusk', label: 'Dusk — dark, rounded' },
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

export function App() {
  const [source, setSource] = useState(() => JSON.stringify(STARTER_SCHEMA, null, 2))
  const [theme, setTheme] = useState<ThemeId>('blueprint')
  const [locale, setLocale] = useState<LocaleId>('en')
  const [pane, setPane] = useState<'schema' | 'build'>('schema')

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
      <header className="bar">
        <h1>formancy playground</h1>
        <span className="note">Edit the schema; the form and the engine follow.</span>
        <div className="spacer" />
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
      </header>

      <div className="panes">
        <section className="pane editor">
          <h2>
            {(['schema', 'build'] as const).map((candidate) => (
              <button
                key={candidate}
                className="mode"
                aria-pressed={pane === candidate}
                onClick={() => setPane(candidate)}
              >
                {candidate === 'schema' ? 'Schema' : 'Build'}
              </button>
            ))}
          </h2>
          <div className="body" hidden={pane !== 'build'}>
            {pane === 'build' ? <BuilderPane source={source} onChange={setSource} /> : null}
          </div>
          <div className="body" hidden={pane !== 'schema'}>
            <Editor
              language="json"
              value={source}
              onChange={(next) => setSource(next ?? '')}
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

        <section className="pane preview">
          <h2>Form</h2>
          <div className="body">
            {parsed.parseError !== undefined ? (
              <Problem title="Not valid JSON yet" detail={parsed.parseError} />
            ) : validated !== undefined && !validated.valid ? (
              <SchemaProblems errors={validated.errors} />
            ) : built?.engineError !== undefined ? (
              <Problem title="The engine refused this schema" detail={built.engineError} />
            ) : built?.engine !== undefined ? (
              <div className="sheet" data-formancy-theme={theme}>
                <FormancyProvider engine={built.engine} key={source}>
                  <ErrorSummary />
                  <FormancyForm />
                </FormancyProvider>
              </div>
            ) : null}
          </div>
        </section>

        <section className="pane">
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
function BuilderPane({ source, onChange }: { source: string; onChange: (next: string) => void }) {
  const session = useMemo(() => {
    try {
      return createBuilderSession(JSON.parse(source) as Parameters<typeof createBuilderSession>[0])
    } catch {
      // createBuilderSession refuses an invalid document on purpose, so a
      // half-typed schema sends you back to the text rather than into a
      // builder that cannot explain itself.
      return null
    }
    // Opened from the text as it was when this pane appeared. Re-opening on
    // every keystroke would throw the undo stack away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (session === null) {
    return (
      <p className="empty" style={{ padding: '1rem' }}>
        This schema cannot be opened in the builder yet. Fix it under Schema and come back.
      </p>
    )
  }

  return <BuilderBody session={session} onChange={onChange} />
}

function BuilderBody({
  session,
  onChange,
}: {
  session: ReturnType<typeof createBuilderSession>
  onChange: (next: string) => void
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
      </div>

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

      {editing === null ? null : <PropertyPanel session={session} keyPath={editing} />}
    </div>
  )
}
