import { useEffect, useMemo, useState } from 'react'
import { createBuilderSession } from '@formancy/builder-core'
import type { BuilderSession } from '@formancy/builder-core'
import { FormancyBuilder, PropertyPanel, useBuilder } from '@formancy/builder-react'
import { createFormEngine } from '@formancy/core'
import { FormancyForm, FormancyProvider } from '@formancy/react'
import type { FormSchema } from '@formancy/spec'
import type { PublishResult } from './api.js'

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
}: {
  source: string
  onChange: (next: string) => void
  publishState: PublishResult | undefined
  onPublish: () => void
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
      <div className="wb-pane" style={{ padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', margin: 0 }}>This form cannot be opened in the builder</h2>
        <p className="wb-problem">{openError}</p>
        <p style={{ fontSize: '0.8125rem' }}>Fix it in the editor tab, then come back.</p>
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
}: {
  session: BuilderSession
  onChange: (next: string) => void
  publishState: PublishResult | undefined
  onPublish: () => void
  selected: readonly string[] | null
  onSelect: (keyPath: readonly string[]) => void
}) {
  const view = useBuilder(session)

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

  return (
    <div className="wb">
      <section className="wb-pane">
        <header>
          Structure
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
            // landed on, so the inspector can follow.
            const item = (event.target as HTMLElement).closest('[role="treeitem"]')
            const at = item === null ? -1 : [...(item.parentElement?.children ?? [])].indexOf(item)
            const node = at < 0 ? undefined : view.nodes[at]
            if (node !== undefined) onSelect(node.keyPath)
          }}
        >
          <FormancyBuilder session={session} />

          {view.publishable.valid ? null : (
            <p className="wb-problem">
              {view.publishable.errors.map((error) => error.message).join(' ')}
            </p>
          )}
          {publishState === undefined ? null : (
            <p className={publishState.ok ? 'wb-ok' : 'wb-problem'}>
              {publishState.ok ? `Published version ${publishState.version}.` : publishState.message}
            </p>
          )}
        </div>
      </section>

      <section className="wb-pane wb-canvas">
        <header>Preview</header>
        <div className="wb-body">
          {'error' in preview ? (
            <p className="wb-problem">{preview.error}</p>
          ) : (
            <div className="wb-sheet" data-formancy-theme="blueprint">
              <FormancyProvider engine={preview.engine}>
                <FormancyForm onSubmit={() => undefined} />
              </FormancyProvider>
            </div>
          )}
        </div>
      </section>

      <section className="wb-pane">
        <header>Properties</header>
        <div className="wb-body">
          {editing === null ? (
            <p style={{ fontSize: '0.8125rem', color: 'var(--wb-muted)' }}>
              Press <kbd>a</kbd> in the structure pane to add a field.
            </p>
          ) : (
            <PropertyPanel session={session} keyPath={editing} />
          )}
        </div>
      </section>
    </div>
  )
}
