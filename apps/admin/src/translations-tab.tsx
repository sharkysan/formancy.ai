import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { createBuilderSession } from '@formancy/builder-core'
import type { BuilderSession } from '@formancy/builder-core'
import { TranslationsPane, useBuilder } from '@formancy/builder-react'
import type { FormSchema } from '@formancy/spec'

/**
 * The translations pane, with a session under it.
 *
 * The same arrangement the build tab uses and for the same reason: a session is
 * opened from the JSON the workspace holds, and the JSON follows the document
 * back, so the editor tab and the publish button see what was translated.
 *
 * Its own session rather than one shared with the build tab, because the build
 * tab opens its own on mount and keeps an undo stack that belongs to structural
 * editing. Sharing one would mean a translator's Ctrl+Z reaching back into
 * somebody's field edits.
 */
export function TranslationsTab({
  source,
  onChange,
}: {
  source: string
  onChange: (next: string) => void
}): ReactElement {
  const [session, setSession] = useState<BuilderSession | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)

  useEffect(() => {
    try {
      setSession(createBuilderSession(JSON.parse(source) as FormSchema))
      setOpenError(null)
    } catch (error) {
      setSession(null)
      setOpenError(error instanceof Error ? error.message : String(error))
    }
    // On mount only, like the build tab: re-opening on every keystroke of the
    // source would throw the undo stack away each time this pane edits it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (session === null) {
    return (
      <div className="wb-pane wb-notice">
        <h2>This form cannot be opened</h2>
        <p className="wb-problem">{openError}</p>
        <p className="wb-hint">Fix it in the editor tab, then come back.</p>
      </div>
    )
  }

  return <Translating session={session} onChange={onChange} />
}

/** Split out because the hook cannot run above the null check. */
function Translating({
  session,
  onChange,
}: {
  session: BuilderSession
  onChange: (next: string) => void
}): ReactElement {
  const view = useBuilder(session)

  useEffect(() => {
    onChange(JSON.stringify(view.document, null, 2))
  }, [view.document, onChange])

  return (
    <div className="wb-pane">
      <header>Translations</header>
      <div className="wb-body">
        <TranslationsPane session={session} />
      </div>
    </div>
  )
}
