import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'

/**
 * Telling somebody their draft came back changed.
 *
 * The server already does the careful half. A republished form migrates a draft
 * lazily on resume, and answers whose field no longer exists move to
 * `data.__orphaned` rather than being deleted
 * ([0027](../../../docs/decisions/0027-lazy-draft-migration.md)). It reports what
 * happened as a severity and a list of changes.
 *
 * **Nothing showed that to the person.** They resumed a draft, some of their
 * answers were no longer on the form, and they submitted believing everything
 * they had typed was in it. The answers are not lost from storage — they are
 * lost from the submission, and nobody was told. `SAFETY-ANALYSIS.md` B2
 * recorded the retention question that orphaning raises, and not this one.
 *
 * ── WHY IT LOOKS LIKE THE ERROR SUMMARY ─────────────────────────────────────
 *
 * Because it is the same problem: something important happened, and the person
 * may be looking at the middle of a long form. The semantics are copied
 * deliberately rather than reinvented. The container takes focus through
 * `tabindex="-1"`, and it is **not** `role="alert"` and carries no `aria-live`
 * — focusing a container already makes a screen reader announce it, and doing
 * both announces it twice, which is the classic double-announcement bug this
 * repository already decided against once.
 *
 * ── WHAT THIS CANNOT DO ─────────────────────────────────────────────────────
 *
 * A library cannot make a host render it. Resuming a draft is the host's call —
 * it holds the transport — so this component exists, is documented, and the
 * safety analysis says plainly that showing it is the deployment's
 * responsibility. That is weaker than a guarantee and is the honest position.
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
      aria-label="This form changed while you were away"
      data-formancy-part="resume-notice"
      data-state={migration.severity}
      tabIndex={-1}
      ref={region}
    >
      <h2 data-formancy-part="resume-notice-heading">This form changed while you were away</h2>

      {migration.severity === 'breaking' ? (
        <p>
          It changed too much for your answers to be moved across, so this is being shown as you
          left it and <strong>cannot be submitted</strong>. Starting again will give you the current
          form.
        </p>
      ) : (
        <>
          <p>
            {setAside.length === 1
              ? 'One question is no longer on this form. Your answer to it is still kept with the rest and will be sent with them — it is just not shown here any more.'
              : `${String(setAside.length)} questions are no longer on this form. Your answers to them are still kept with the rest and will be sent with them — they are just not shown here any more.`}
          </p>
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
