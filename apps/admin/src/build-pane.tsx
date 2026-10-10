import { useEffect, useMemo, useState } from 'react'
import { createBuilderSession } from '@formancy/builder-core'
import type { BuilderSession } from '@formancy/builder-core'
import {
  FormancyArrangeSurface,
  FormancyBuilder,
  FormancyLayoutPane,
  LogicPanel,
  PromptPane,
  PropertyPanel,
  useBuilder,
} from '@formancy/builder-react'
import { createFormEngine } from '@formancy/core'
import { FormancyForm, FormancyProvider, UploaderProvider } from '@formancy/react'
import type { Uploader } from '@formancy/react'
import type { FormSchema } from '@formancy/spec'
import { askServerModel, uploadFile } from './api.js'
import { ExamplesPart } from './examples-pane.js'
import type { KeptExamples } from './examples-pane.js'
import { ModelNote } from './model-note.js'
import { PublishNote } from './publish-note.js'
import type { PublishResult, ServerModel } from './api.js'

/**
 * The builder, in the three-pane inspector layout every builder uses:
 * structure on the left, the thing being built in the middle, its properties
 * on the right. Inventing a different arrangement would make somebody learn a
 * layout they already know.
 *
 * The session owns the document while this tab is open and the JSON text is
 * derived from it, so the two tabs cannot disagree: switching to the raw
 * editor shows exactly what the builder produced, and switching back re-opens
 * the session from whatever the editor left.
 */
export function BuildPane({
  source,
  onChange,
  publishState,
  onPublish,
  formPath,
  model,
  kept,
  published = false,
}: {
  source: string
  onChange: (next: string) => void
  publishState: PublishResult | undefined
  onPublish: () => void
  /** The server's model, when it has one: then the prompt pane is drawn, asking through it (0165). */
  model?: ServerModel | undefined
  /**
   * The form's examples as the server keeps them, run by the scenario pane and by the review
   * of a model's edit, in server mode, as the publish runs them (0166). Absent, neither is drawn.
   */
  kept?: KeptExamples
  /** Whether the server has this form: examples are kept only beside one it has. */
  published?: boolean
  /**
   * The form being edited, so the preview can accept files.
   *
   * Absent for a form that has never been published: there is nowhere to put
   * bytes for a form the server has not heard of, and the file field says so
   * rather than failing when somebody picks one.
   */
  formPath?: string
}) {
  const [session, setSession] = useState<BuilderSession | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [selected, setSelected] = useState<readonly string[] | null>(null)

  // Opened once, from whatever the JSON currently says.
  // createBuilderSession refuses an invalid document on purpose — a session
  // opened on one would make every later refusal ambiguous — so a broken
  // document sends you to the raw editor rather than into a builder that
  // cannot explain itself.
  useEffect(() => {
    try {
      setSession(createBuilderSession(JSON.parse(source) as FormSchema))
      setOpenError(null)
    } catch (error) {
      setSession(null)
      setOpenError(error instanceof Error ? error.message : String(error))
    }
    // Only on mount: re-running on every keystroke of `source` would throw the
    // undo stack away each time the builder edits it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (session === null) {
    return (
      <div className="wb-pane wb-notice">
        <h2>This form cannot be opened in the builder</h2>
        <p className="wb-problem">{openError}</p>
        <p className="wb-hint">Fix it in the editor tab, then come back.</p>
      </div>
    )
  }

  return (
    <BuilderWorkspace
      session={session}
      onChange={onChange}
      publishState={publishState}
      onPublish={onPublish}
      selected={selected}
      onSelect={setSelected}
      {...(formPath === undefined ? {} : { formPath })}
      model={model}
      kept={kept}
      published={published}
    />
  )
}

function BuilderWorkspace({
  session,
  onChange,
  publishState,
  onPublish,
  selected,
  onSelect,
  formPath,
  model,
  kept,
  published,
}: {
  session: BuilderSession
  onChange: (next: string) => void
  publishState: PublishResult | undefined
  onPublish: () => void
  selected: readonly string[] | null
  onSelect: (keyPath: readonly string[]) => void
  formPath?: string
  model: ServerModel | undefined
  kept: KeptExamples | undefined
  published: boolean
}) {
  const view = useBuilder(session)
  /**
   * Two editors over one document.
   *
   * The model says what the form collects; the arrangement says where it
   * appears. A field can be in the first and missing from the second, so one
   * tree showing both would have to pretend those are the same question.
   */
  const [editor, setEditor] = useState<'structure' | 'arrangement'>('structure')

  // The JSON text follows the document, so the editor tab and the publish
  // button always see what the builder actually built.
  useEffect(() => {
    onChange(JSON.stringify(view.document, null, 2))
  }, [view.document, onChange])

  const preview = useMemo(() => {
    try {
      return {
        engine: createFormEngine({
          schema: view.document,
          capabilities: {
            now: () => Date.now(),
            today: () => new Date().toISOString().slice(0, 10),
            random: () => Math.random(),
          },
        }),
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }, [view.document])

  const editing = selected ?? view.nodes[0]?.keyPath ?? null

  /**
   * The preview accepts files for real, against the server.
   *
   * Undefined until the form has been published: there is nowhere to put bytes
   * for a form the server has not heard of, and the field says so rather than
   * accepting a file it will lose. `useMemo` so it is one function for as long as
   * the form path is one path: each file field hands its uploads to it afresh
   * whenever it changes.
   */
  const uploader = useMemo<Uploader | undefined>(
    () =>
      formPath === undefined
        ? undefined
        : // The renderer says which field each file is for, so a preview with two
          // file fields offers each against its own rules (0130).
          (file, options) => uploadFile(formPath, file, options),
    [formPath],
  )
  // The preview renders THROUGH the arrangement when there is one. Without
  // this, moving two fields into a row changes nothing anybody can see, which
  // reads as a broken editor rather than as a preview that ignores layouts.
  const layoutName = view.document.layouts?.[0]?.name

  return (
    <div className="wb">
      <section className="wb-pane">
        <header>
          <span className="wb-switch">
            {(['structure', 'arrangement'] as const).map((candidate) => (
              <button
                key={candidate}
                aria-pressed={editor === candidate}
                onClick={() => setEditor(candidate)}
              >
                {candidate === 'structure' ? 'Structure' : 'Arrangement'}
              </button>
            ))}
          </span>
          <div className="wb-tools">
            <button onClick={() => session.undo()} disabled={!view.canUndo}>
              Undo
            </button>
            <button onClick={() => session.redo()} disabled={!view.canRedo}>
              Redo
            </button>
            <button className="wb-primary" onClick={onPublish} disabled={!view.publishable.valid}>
              Publish
            </button>
          </div>
        </header>

        <div
          className="wb-body"
          onFocusCapture={(event) => {
            // The tree owns its own focus; this only notices which field it
            // landed on, so the inspector can follow. Skipped for the
            // arrangement, whose tree items are positions rather than fields —
            // reading one as an index into the model would select at random.
            if (editor !== 'structure') return
            const item = (event.target as HTMLElement).closest('[role="treeitem"]')
            const at = item === null ? -1 : [...(item.parentElement?.children ?? [])].indexOf(item)
            const node = at < 0 ? undefined : view.nodes[at]
            if (node !== undefined) onSelect(node.keyPath)
          }}
        >
          {/* Only when the server has a model: the pane renders nothing without an `ask`,
              and an ask that can only fail would draw a button that cannot work. The
              pane's run is its own, so leaving the build tab stops it (0157). */}
          {model === undefined ? null : (
            <>
              <ModelNote model={model} sends="your instruction and this whole form" />
              <PromptPane
                session={session}
                ask={askServerModel}
                scenarios={kept?.examples?.scenarios}
                initialValue={kept?.examples?.sample}
                mode="server"
              />
            </>
          )}
          {editor === 'structure' ? (
            <FormancyBuilder session={session} />
          ) : (
            <FormancyLayoutPane
              session={session}
              {...(layoutName === undefined ? {} : { layout: layoutName })}
            />
          )}

          {view.publishable.valid ? null : (
            <p className="wb-problem">
              {view.publishable.errors.map((error) => error.message).join(' ')}
            </p>
          )}
          <PublishNote state={publishState} />
        </div>
      </section>

      <section className="wb-pane wb-canvas">
        <header>Preview</header>
        <div className="wb-body">
          {'error' in preview ? (
            <p className="wb-problem">{preview.error}</p>
          ) : (
            // The preview is also a drop target while the Arrangement editor
            // is showing. The same session command the tree and the keyboard
            // use, so the two views cannot disagree about the document.
            <FormancyArrangeSurface
              session={session}
              layout={layoutName ?? ''}
              enabled={editor === 'arrangement' && layoutName !== undefined}
            >
              <div className="wb-sheet" data-formancy-theme="blueprint">
                <UploaderProvider value={uploader}>
                <FormancyProvider engine={preview.engine}>
                  <FormancyForm
                    onSubmit={() => undefined}
                    {...(layoutName === undefined ? {} : { layout: layoutName })}
                  />
                </FormancyProvider>
                </UploaderProvider>
              </div>
            </FormancyArrangeSurface>
          )}
        </div>
      </section>

      <section className="wb-pane">
        <header>Properties</header>
        <div className="wb-body">
          {kept === undefined ? null : (
            <ExamplesPart session={session} kept={kept} published={published} model={model} />
          )}
          {editing === null ? (
            <p className="wb-hint">
              Press <kbd>a</kbd> in the structure pane to add a field, or <kbd>p</kbd> to add a
              page and make the form a wizard.
            </p>
          ) : (
            <>
              <PropertyPanel session={session} keyPath={editing} />
              <LogicPanel session={session} keyPath={editing} />
            </>
          )}
        </div>
      </section>
    </div>
  )
}

