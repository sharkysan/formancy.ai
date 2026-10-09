import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import Editor, { useMonaco } from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import { createFormEngine, parsePath } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import { validateSchema } from '@formancy/spec/validate'
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
import type { BuilderBlock, BuilderSession } from '@formancy/builder-core'
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
import { DEMOS, initialDemo, initialLocale } from './demos.js'
import { AngularPane } from './angular-pane.js'
import { EngineInspector } from './engine-inspector.js'
import { FoldPane, PANES, PaneBoundary, usePaneLayout } from './panes.js'
import { EditorPane } from './editor-pane.js'
import type { EditorMode } from './editor-pane.js'
import type { PaneId } from './panes.js'
import { BuilderBody, PLACEHOLDER_SESSION, builderTextFor } from './builder-pane.js'
import { DEMO_BLOCKS } from './demo-blocks.js'
import { PLAYGROUND_CHECKS } from './demo-checks.js'
import { Problem, SchemaProblems } from './problems.js'

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
  { id: 'fr', label: 'Français' },
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


export function App() {
  const [demo, setDemo] = useState(() => initialDemo(window.location.search).id)
  const [source, setSource] = useState(() => JSON.stringify(initialDemo(window.location.search).schema, null, 2))
  const [theme, setTheme] = useState<ThemeId>('blueprint')

  /**
   * Theme tokens the visitor has changed, per theme.
   *
   * Kept per theme because the four declare different vocabularies: carrying one
   * map across a switch would apply `--fm-hair` to a theme that has never heard
   * of it, and silently drop the edits on the way back.
   *
   * Applied as custom properties on the themed host rather than as resolved
   * declarations -- the lesson from the pane template (0100): set the variable
   * and leave the declarations to the cascade.
   */
  const [themeEdits, setThemeEdits] = useState<Readonly<Record<string, Record<string, string>>>>({})
  const overrides = themeEdits[theme] ?? {}
  const [themeHost, setThemeHost] = useState<HTMLElement | null>(null)
  const [locale, setLocale] = useState<LocaleId>(() => initialLocale(window.location.search))
  const [pane, setPane] = useState<EditorMode>('build')
  /**
   * The builder session lives up here, not inside the Build pane, because the
   * PREVIEW is a drop target too and a drop has to reach the same session the
   * tree edits. Two sessions over one document would be two documents.
   */
  const [session, setSession] = useState<BuilderSession | null>(null)
  const [builderTab, setBuilderTab] = useState<'fields' | 'arrangement' | 'rules'>('fields')
  /**
   * The blocks both builders offer: a demo one, and whatever is saved this visit (0135).
   * Up here because a block outlives the form it was saved from — saved from one
   * template, it is offered in the next — and because the Build pane is unmounted when
   * somebody switches to Schema. A real host stores them; this page holds them in memory.
   */
  const [blocks, setBlocks] = useState<readonly BuilderBlock[]>(DEMO_BLOCKS)
  const keepBlock = useCallback((block: BuilderBlock) => {
    setBlocks((current) => [...current.filter((kept) => kept.id !== block.id), block])
  }, [])
  const [shown, setShown] = useState<PaneId>('form')

  const panes = usePaneLayout()

  // Opened when the Build pane appears, from whatever the text says then, and
  // again when a different demo or language is chosen.
  //
  // Not re-opened as `source` changes in general: the builder writes it on every
  // edit, and re-opening would throw the undo stack away. A demo is a different
  // document, so throwing it away is right — without `demo` here the form followed
  // the picker and the structure tree did not. A language is fixed for a session's
  // lifetime, as an engine's locale is, so the Language switch, which the form
  // already follows, opens the same text again in the builder's new words (0114).
  useEffect(() => {
    if (pane !== 'build') {
      setSession(null)
      return
    }
    try {
      setSession(createBuilderSession(JSON.parse(source) as FormSchema, { text: builderTextFor(locale) }))
    } catch {
      // createBuilderSession refuses an invalid document on purpose, so a
      // half-typed schema sends you back to the text rather than into a
      // builder that cannot explain itself.
      setSession(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane, demo, locale])

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

      <div
        className="panes"
        data-shown={shown}
        /*
         * A custom property, not `grid-template-columns` itself. An inline
         * declaration beats every rule in the stylesheet, including the
         * narrow-screen override that asks for a single column — which was
         * silently losing while this set the property directly.
         */
        style={{ '--pane-template': panes.template } as CSSProperties}
      >
        {/* A named region per pane, so the heading names it for a screen reader
            moving by landmark and for a test asking by role — the same reason
            the two renderers inside the form pane are named regions. */}
        <EditorPane
          mode={pane}
          onMode={setPane}
          folded={panes.folded.has('editor')}
          onFold={() => panes.foldPane('editor')}
          source={source}
          onSource={setSource}
          session={session}
          tab={builderTab}
          onTab={setBuilderTab}
          blocks={blocks}
          onSaveBlock={keepBlock}
          preview={built?.engine}
          theme={theme}
          themeHost={themeHost}
          overrides={overrides}
          onThemeChange={(next) => setThemeEdits((current) => ({ ...current, [theme]: next }))}
        />

        <PaneBoundary layout={panes} left="editor" right="form" />

        <section
          className="pane preview"
          id="pane-form"
          aria-label="Form"
          data-folded={panes.folded.has('form') ? 'true' : undefined}
        >
          <h2>
            <FoldPane pane="Form" folded={panes.folded.has('form')} onToggle={() => panes.foldPane('form')} />
            Form
          </h2>
          <div className="body">
            {parsed.parseError !== undefined ? (
              <Problem title="Not valid JSON yet" detail={parsed.parseError} />
            ) : validated !== undefined && !validated.valid ? (
              <SchemaProblems errors={validated.errors} text={builderTextFor(locale)} />
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
                        <form
                          className="sheet"
                          aria-label="React form preview"
                          onSubmit={(event) => event.preventDefault()}
                          noValidate
                          data-formancy-theme={theme}
                          ref={setThemeHost}
                          style={overrides as CSSProperties}
                        >
                          <FormancyProvider engine={built.engine} key={source}>
                            <ErrorSummary />
                            <FormancyForm layout="web" />
                          </FormancyProvider>
                        </form>
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

        <PaneBoundary layout={panes} left="form" right="engine" />

        <section
          className="pane engine"
          id="pane-engine"
          aria-label="Engine"
          data-folded={panes.folded.has('engine') ? 'true' : undefined}
        >
          <h2>
            <FoldPane pane="Engine" folded={panes.folded.has('engine')} onToggle={() => panes.foldPane('engine')} />
            Engine
          </h2>
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
