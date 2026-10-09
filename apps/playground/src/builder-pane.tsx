import { useEffect, useState } from 'react'
import {
  FormancyBuilder,
  FormancyLayoutPane,
  LayoutPropertyPanel,
  LogicPanel,
  PromptPane,
  PropertyPanel,
  ScenarioPane,
  useBuilder,
} from '@formancy/builder-react'
import {
  BUILDER_MESSAGES_DE,
  BUILDER_MESSAGES_FR,
  SCHEMA_WORDS_DE,
  SCHEMA_WORDS_FR,
  createBuilderSession,
  createBuilderText,
} from '@formancy/builder-core'
import type { BuilderSession, BuilderText } from '@formancy/builder-core'
import { AngularBuilderPane } from './angular-builder-pane.js'
import { DEMO_MODEL } from './demo-capabilities.js'
import { STARTER_SAMPLE, STARTER_SCENARIOS } from './starter-scenarios.js'

/**
 * The builder pane: two trees over one document, in either framework.
 *
 * Its own file because `app.tsx`'s size budget names the seam as one pane per
 * file, and this is the pane that grew: the Angular builder arrived beside the
 * React one, over the same session, and with it a chooser for which is on
 * screen.
 *
 * The chooser switches the INTERFACE and not the document. There is one
 * `BuilderSession` — one undo stack, one selection the JSON shows, one pair of
 * rendered forms — and both builders subscribe to it without knowing the other
 * exists ([0096](../../../docs/decisions/0096-two-builders-one-session.md)).
 */
/**
 * The same builder the admin uses, over the same document the JSON editor
 * edits. Switching panes is not switching tools: the session is opened from
 * the current text and every edit writes it back, so the JSON is always what
 * the builder built and the builder always shows what the JSON says.
 */
/**
 * The builder's language for the page's Language switch, so the one control
 * says the builder speaks the author's language as well as the form speaking the
 * reader's ([0114](../../../docs/decisions/0114-the-builder-speaks-the-authors-language.md)).
 *
 * Both catalogues the builder ships, and English for anything else. The FORM's
 * French is deliberately incomplete, to show its fallback; the builder's is not,
 * because a shipped catalogue is a complete one.
 */
export function builderTextFor(locale: string): BuilderText {
  if (locale === 'de') {
    return createBuilderText({ locale, messages: BUILDER_MESSAGES_DE, schema: SCHEMA_WORDS_DE })
  }
  if (locale === 'fr') {
    return createBuilderText({ locale, messages: BUILDER_MESSAGES_FR, schema: SCHEMA_WORDS_FR })
  }
  return createBuilderText({ locale, messages: {} })
}

/**
 * A session that exists only so the preview's drop surface has one to hold
 * while the document is unopenable. It is never enabled, so nothing reaches
 * it — and a component whose props go optional for one edge case grows two
 * code paths for the rest of its life.
 */
export const PLACEHOLDER_SESSION: BuilderSession = createBuilderSession({
  specVersion: '1',
  id: 'placeholder',
  title: 'No form',
  model: { fields: [] },
})

export function BuilderBody({
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
  /**
   * Which builder is on screen.
   *
   * Both edit the SAME session, so this switches the interface and not the
   * document: the undo stack, the selection the JSON shows and both rendered
   * forms are untouched by it. That is the demonstration — a builder is a
   * binding ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)),
   * and the way to show it is to swap one for the other mid-edit.
   */
  const [builtWith, setBuiltWith] = useState<'react' | 'angular'>('react')

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
        {/* A labelled chooser rather than a second row of pressed buttons: this
            picks which PRODUCT you are looking at, where the tabs pick which
            part of one. */}
        <label className="built-with">
          Builder
          <select
            value={builtWith}
            onChange={(event) => setBuiltWith(event.target.value as 'react' | 'angular')}
          >
            <option value="react">React</option>
            <option value="angular">Angular</option>
          </select>
        </label>
      </div>

      {builtWith === 'angular' ? (
        /* The other builder, over the same session. An edit here moves the JSON
           and both rendered forms, which is the whole point of it being the same
           session rather than a second one. */
        <AngularBuilderPane session={session} tab={tab} />
      ) : tab === 'arrangement' ? (
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
          {/* Describing a change in words, and reviewing what it did before it
              lands. The model is a stand-in — the person plays it, as they
              play the camera — because this app has no vendor and no key, and
              that is the point of `ask` being the host's
              ([0109](../../../docs/decisions/0109-an-ai-edit-is-reviewed-before-it-lands.md)).
              Everything after the answer is real: parsed, validated, compiled,
              type-checked, diffed and held for review. */}
          <PromptPane session={session} ask={DEMO_MODEL} />

          <FormancyBuilder session={session} onSelect={setSelected} />

          {/* What this form is supposed to do, rerun after every edit. The
              check nothing else can make: a condition compiles whichever way
              round it is written, and only an example with its answer written
              down tells the two apart
              ([0110](../../../docs/decisions/0110-a-form-is-checked-against-examples.md)).
              The scenarios are the host's — here, a file beside the starter. */}
          <ScenarioPane
            session={session}
            scenarios={STARTER_SCENARIOS}
            initialValue={STARTER_SAMPLE}
          />

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
