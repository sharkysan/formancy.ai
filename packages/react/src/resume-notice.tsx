import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import { useFormText } from './context.js'

/**
 * Telling somebody their draft came back changed.
 *
 * The server already does the careful half. A republished form migrates a draft
 * lazily on resume, and answers whose field no longer exists move to
 * `data.__orphaned` rather than being deleted
 * ([0027](../../../docs/decisions/0027-lazy-draft-migration.md)). It reports what
 * happened as a severity and a list of changes.
 *
 * This is what shows it. Without it somebody resumes a draft, some of their answers are
 * no longer on the form, and they submit believing everything they typed is in it — the
 * answers are not lost from storage, they are lost from the submission.
 *
 * It is built like the error summary, and for the same reason: something important
 * happened and the person may be looking at the middle of a long form. The container
 * takes focus through `tabindex="-1"`, and is **not** `role="alert"` and carries no
 * `aria-live` — focusing a container already makes a screen reader announce it, and
 * doing both announces it twice.
 *
 * **A library cannot make a host render it.** Resuming a draft is the host's call, so
 * this component exists and is documented, and showing it is the deployment's
 * responsibility. `SAFETY-ANALYSIS.md` says so rather than claiming a guarantee.
 *
 * **It speaks the form's language inside the form's `FormancyProvider`**, and English
 * outside one, where there is no engine to take a language from (0171).
 */

/** What `resumeDraft` reports. Structural, so a host need not import a type. */
export interface ResumeMigration {
  readonly severity: 'lossy' | 'breaking'
  readonly changes: ReadonlyArray<{ readonly kind: string; readonly path?: string }>
}

export interface ResumeNoticeProps {
  /** Omitted or undefined when the draft came back unchanged. */
  readonly migration?: ResumeMigration | undefined
  /** Question wording for a field key, since a key is not what the form asked. */
  readonly labels?: Readonly<Record<string, string>>
}

export function ResumeNotice({ migration, labels }: ResumeNoticeProps): ReactElement | null {
  const region = useRef<HTMLDivElement | null>(null)
  const text = useFormText()

  useEffect(() => {
    if (migration !== undefined) region.current?.focus()
  }, [migration])

  // A form that opens by announcing that nothing happened teaches people to
  // dismiss the notice without reading it, which is how the one that matters
  // gets missed.
  if (migration === undefined) return null

  const setAside = migration.changes
    .map((change) => change.path)
    .filter((path): path is string => path !== undefined)

  return (
    <div
      role="region"
      aria-label={text('resume.heading')}
      data-formancy-part="resume-notice"
      data-state={migration.severity}
      tabIndex={-1}
      ref={region}
    >
      <h2 data-formancy-part="resume-notice-heading">{text('resume.heading')}</h2>

      {migration.severity === 'breaking' ? (
        // Three whole sentences rather than one with a hole in it: a translator cannot
        // move an emphasised phrase that is spliced into the middle of somebody else's.
        <p>
          {text('resume.breaking.kept')} <strong>{text('resume.breaking.cannotSubmit')}</strong>{' '}
          {text('resume.breaking.restart')}
        </p>
      ) : (
        <>
          <p>{text('resume.setAside', { count: setAside.length })}</p>
          {setAside.length === 0 ? null : (
            <ul data-formancy-part="resume-notice-list">
              {setAside.map((path) => (
                // The question's wording when the caller knows it. A field key
                // is what the schema calls it, not what the form asked.
                <li key={path}>{labels?.[path] ?? path}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
