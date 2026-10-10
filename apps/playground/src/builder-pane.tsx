import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  FormancyBuilder,
  FormancyLayoutPane,
  LayoutPropertyPanel,
  LogicPanel,
  PromptPane,
  PropertyPanel,
  RelayPane,
  RulesOverview,
  ScenarioPane,
  TranslationsPane,
  useBuilder,
} from '@formancy/builder-react'
import {
  BUILDER_MESSAGES_DE,
  BUILDER_MESSAGES_FR,
  SCHEMA_ERRORS_DE,
  SCHEMA_ERRORS_FR,
  SCHEMA_WORDS_DE,
  SCHEMA_WORDS_FR,
  captureCapabilities,
  createBuilderSession,
  createBuilderText,
} from '@formancy/builder-core'
import type { FormEngine, Scenario } from '@formancy/core'
import type { BuilderBlock, BuilderSession, BuilderText, PromptRun, Relay } from '@formancy/builder-core'
import { AngularBuilderPane } from './angular-builder-pane.js'
import type { BuilderTab, PreviewState } from './angular-builder-host.js'
import { RELAY_CHAT } from './demo-capabilities.js'

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
    return createBuilderText({
      locale,
      messages: BUILDER_MESSAGES_DE,
      schema: SCHEMA_WORDS_DE,
      errors: SCHEMA_ERRORS_DE,
    })
  }
  if (locale === 'fr') {
    return createBuilderText({
      locale,
      messages: BUILDER_MESSAGES_FR,
      schema: SCHEMA_WORDS_FR,
      errors: SCHEMA_ERRORS_FR,
    })
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
  blocks,
  onSaveBlock,
  scenarios,
  sample,
  onScenarios,
  preview,
  relay,
  promptRun,
}: {
  session: BuilderSession
  onChange: (next: string) => void
  tab: BuilderTab
  onTab: (next: BuilderTab) => void
  /**
   * One list for both builders, kept by the page: a block saved in either is offered by
   * the other, as an edit made in either is in the other's tree (0135).
   */
  blocks: readonly BuilderBlock[]
  onSaveBlock: (block: BuilderBlock) => void
  /**
   * The examples, kept by the page the same way: one list both builders run, so one
   * removed in either is gone from the other (0111).
   */
  scenarios: readonly Scenario[]
  /** Where every example starts: the form's fictional sample (0110). */
  sample: Readonly<Record<string, unknown>> | undefined
  onScenarios: (next: readonly Scenario[]) => void
  /** The form pane's engine, whose answers the rules tab explains (0128). */
  preview: FormEngine | undefined
  /**
   * The model both builders' prompt and translations panes ask: a person carrying each
   * turn (0160). The page's, so a turn asked from either builder is the one relay's.
   */
  relay: Relay
  /**
   * The prompt pane's run, the page's: it goes on when this body, a tab or a builder goes,
   * and either builder's prompt pane draws it (0163).
   */
  promptRun: PromptRun
}) {
  const view = useBuilder(session)
  const explained = usePreviewState(preview)
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
          {(['fields', 'arrangement', 'rules', 'translations'] as const).map((candidate) => (
            <button
              key={candidate}
              aria-pressed={tab === candidate}
              onClick={() => onTab(candidate)}
            >
              {TAB_NAMES[candidate]}
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
           session rather than a second one. It draws its own relay pane, at its top. */
        <AngularBuilderPane
          session={session}
          tab={tab}
          preview={explained}
          blocks={blocks}
          onSaveBlock={onSaveBlock}
          scenarios={scenarios}
          sample={sample}
          onScenarios={onScenarios}
          relay={relay}
          promptRun={promptRun}
        />
      ) : (
        <>
          {/* The turn a person is carrying to a model, above the tabs rather than inside
              one: it belongs to the run, not to a tab's layout. Nothing while nothing
              waits. The prompt pane's run is the page's, so its turn stays here under any
              tab, in either builder, and after the Schema view (0163); the scenario pane's
              drafting and the translations pane's runs are still theirs, and end if that
              pane goes (0157). The chat is this deployment's choice, named in
              `demo-capabilities.ts` and nowhere else (0160). */}
          <RelayPane session={session} relay={relay} chat={RELAY_CHAT} />
          {tab === 'rules' ? (
            /* Every rule in the form, and — from the answers typed into the form pane —
               why each field is shown, hidden or required now. Type into the form and
               watch a verdict change; that is the demonstration. */
            <RulesOverview
              session={session}
              answers={explained?.answers}
              capabilities={explained?.capabilities}
            />
          ) : tab === 'translations' ? (
            /* The starter's French is half-finished on purpose. The form pane shows the
               fallback; this shows the other half — choose French and every message
               nobody has translated is marked, beside the English it stands in for. And
               asks the page's relay for them: the turn is drawn above, as the prompt
               pane's is, and the answer is reviewed message by message before it lands
               (0161). */
            <TranslationsPane session={session} ask={relay.ask} />
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
                  lands. The model is the relay: the request is shown above, the visitor
                  carries it to a chat of their own and pastes the answer back, because
                  this site asks no other site for anything (0154, 0160). Everything
                  after the paste is real: parsed, validated, compiled, type-checked,
                  diffed and held for review
                  ([0109](../../../docs/decisions/0109-an-ai-edit-is-reviewed-before-it-lands.md))
                  — and run against the form's examples, the list the scenario pane runs,
                  before it lands (0159). */}
              <PromptPane
                session={session}
                ask={relay.ask}
                run={promptRun}
                scenarios={scenarios}
                initialValue={sample}
              />

              <FormancyBuilder
                session={session}
                onSelect={setSelected}
                blocks={blocks}
                onSaveBlock={onSaveBlock}
              />

              {/* What this form is supposed to do, rerun after every edit. The
                  check nothing else can make: a condition compiles whichever way
                  round it is written, and only an example with its answer written
                  down tells the two apart
                  ([0110](../../../docs/decisions/0110-a-form-is-checked-against-examples.md)).
                  The scenarios are the host's — here, the page's list, started from a
                  file beside the starter. Without `onChange` the pane draws no Remove
                  button, and it had none. With the relay as well, it drafts examples from
                  what the visitor says the form should do, and one kept goes into the
                  page's list for this form (0162). */}
              <ScenarioPane
                session={session}
                scenarios={scenarios}
                onChange={onScenarios}
                initialValue={sample}
                ask={relay.ask}
              />

              {editing === null ? null : (
                <>
                  <PropertyPanel session={session} keyPath={editing} />
                  <LogicPanel session={session} keyPath={editing} />
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

/** What the tabs are called; exported so a test can visit every one, not a list of its own. */
export const TAB_NAMES: Readonly<Record<BuilderTab, string>> = {
  fields: 'Fields',
  arrangement: 'Arrangement',
  rules: 'Rules',
  translations: 'Translations',
}

const NO_PREVIEW = (): (() => void) => () => undefined

/**
 * What the form pane's preview holds, for the rules tab to explain: its answers, and a
 * clock read the way the preview's engine reads one, so a rule about today's date is
 * explained by the date the preview used.
 */
function usePreviewState(preview: FormEngine | undefined): PreviewState | undefined {
  const answers = useSyncExternalStore(
    preview === undefined ? NO_PREVIEW : (listener) => preview.subscribe(listener),
    () => preview?.value(),
  )
  return useMemo(
    () =>
      answers === undefined || answers === null || typeof answers !== 'object'
        ? undefined
        : {
            answers: answers as Readonly<Record<string, unknown>>,
            capabilities: captureCapabilities({
              now: () => Date.now(),
              today: () => new Date().toISOString().slice(0, 10),
              random: () => Math.random(),
            }),
          },
    [answers],
  )
}
