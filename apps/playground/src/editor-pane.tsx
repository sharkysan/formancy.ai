import type { FormEngine, Scenario } from '@formancy/core'
import type { BuilderTab } from './angular-builder-host.js'
import { useMemo } from 'react'
import Editor from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import type { BuilderBlock, BuilderSession } from '@formancy/builder-core'
import { FoldPane } from './panes.js'
import { BuilderBody } from './builder-pane.js'
import { ThemePane } from './theme-pane.js'

/**
 * The editor pane: three ways to change the document in front of you.
 *
 * Its own file for the seam `app.tsx` has used five times -- one pane per file --
 * and because a third mode pushed that file past its ceiling again. The budget
 * was pointing at something real both times: the pane owns a mode, three bodies
 * and a Monaco palette, none of which the page around it reads.
 *
 * **Build, Schema and Theme, and all three stay mounted.** `hidden` rather than
 * conditional, for the reason folding a pane is: Monaco holds a scroll position
 * and an undo stack, the builder holds a selection, and the theme editor holds
 * the overrides somebody is in the middle of. A switch that threw those away is
 * a switch nobody uses twice.
 */
export type EditorMode = 'build' | 'schema' | 'theme'

export function EditorPane({
  mode,
  onMode,
  folded,
  onFold,
  source,
  onSource,
  session,
  tab,
  onTab,
  blocks,
  onSaveBlock,
  scenarios,
  onScenarios,
  preview,
  theme,
  themeHost,
  overrides,
  onThemeChange,
}: {
  mode: EditorMode
  onMode: (mode: EditorMode) => void
  folded: boolean
  onFold: () => void
  source: string
  onSource: (source: string) => void
  session: BuilderSession | null
  tab: BuilderTab
  onTab: (tab: BuilderTab) => void
  /** The page's blocks, which both builders offer, and where a saved one goes. */
  blocks: readonly BuilderBlock[]
  onSaveBlock: (block: BuilderBlock) => void
  /** The page's examples, which both builders run, and where a shorter list goes. */
  scenarios: readonly Scenario[]
  onScenarios: (next: readonly Scenario[]) => void
  /** The form pane's engine, whose answers the rules tab explains. */
  preview: FormEngine | undefined
  theme: string
  themeHost: HTMLElement | null
  overrides: Readonly<Record<string, string>>
  onThemeChange: (overrides: Record<string, string>) => void
}) {
  /*
   * Monaco's options object identity decides whether it reconfigures, and a
   * fresh literal per render makes it do so on every keystroke.
   *
   * This was memoised and then **not used**: the extraction left an inline
   * literal on the editor and nothing read this, so the memo was dead and the
   * reconfiguration was happening anyway. Found by reading the coverage report
   * rather than by any test — an unused local is not a failure, which is exactly
   * why it survived a green suite.
   */
  const options = useMemo(
    () => ({
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      fontFamily: "'IBM Plex Mono', ui-monospace, Consolas, monospace",
      tabSize: 2,
    }),
    [],
  )

  return (
    <section
      className="pane editor"
      id="pane-editor"
      aria-label="Editor"
      data-folded={folded ? 'true' : undefined}
    >
      <h2>
        <FoldPane pane="Editor" folded={folded} onToggle={() => onFold()} />
        {(['build', 'schema', 'theme'] as const).map((candidate) => (
          <button
            key={candidate}
            className="mode"
            aria-pressed={mode === candidate}
            onClick={() => onMode(candidate)}
          >
            {candidate === 'build' ? 'Build' : candidate === 'schema' ? 'Schema' : 'Theme'}
          </button>
        ))}
      </h2>
      <div className="body" hidden={mode !== 'build'}>
        {mode !== 'build' ? null : session === null ? (
          <p className="empty" style={{ padding: '1rem' }}>
            This schema cannot be opened in the builder yet. Fix it under Schema and come back.
          </p>
        ) : (
          <BuilderBody
            session={session}
            onChange={onSource}
            tab={tab}
            onTab={onTab}
            blocks={blocks}
            onSaveBlock={onSaveBlock}
            scenarios={scenarios}
            onScenarios={onScenarios}
            preview={preview}
          />
        )}
      </div>
      <div className="body theme" hidden={mode !== 'theme'}>
        {mode !== 'theme' ? null : (
          <ThemePane
            theme={theme}
            host={themeHost}
            overrides={overrides}
            onChange={(next) => onThemeChange(next)}
          />
        )}
      </div>
      <div className="body schema" hidden={mode !== 'schema'}>
        <Editor
          language="json"
          value={source}
          onChange={(next) => onSource(next ?? '')}
          beforeMount={defineNightTheme}
          theme="formancy-night"
          options={options}
        />
      </div>
    </section>
  )
}

export function defineNightTheme(monaco: Monaco): void {
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
