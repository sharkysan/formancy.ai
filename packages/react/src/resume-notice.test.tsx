import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { ResumeNotice } from './resume-notice.js'

afterEach(cleanup)

/**
 * Telling somebody their draft came back changed.
 *
 * The server already does the careful half: a republished form migrates a draft
 * lazily, and answers whose field is gone move to `data.__orphaned` rather than
 * being deleted ([0027](../../../docs/decisions/0027-lazy-draft-migration.md)).
 * It reports what happened as a migration severity and a list of changes.
 *
 * **Nothing showed that to the person.** They resumed a draft, some answers were
 * no longer on the form, and they submitted believing everything they had typed
 * was in it. The answers are not lost from storage; they are lost from the
 * submission, and nobody is told. `SAFETY-ANALYSIS.md` B2 recorded the retention
 * question this raises and not this one.
 *
 * The semantics follow `ErrorSummary`, which solved the same shape of problem
 * already: the container takes focus through `tabindex="-1"`, and it is
 * deliberately NOT `role="alert"` — focusing it already makes a screen reader
 * announce it, and doing both announces it twice.
 */
const LOSSY = {
  severity: 'lossy' as const,
  changes: [
    { kind: 'field.removed' as const, path: 'nickname', severity: 'lossy' as const },
    { kind: 'field.removed' as const, path: 'fax', severity: 'lossy' as const },
  ],
}

describe('when a draft came back unchanged', () => {
  test('nothing is rendered, because there is nothing to say', () => {
    const { container } = render(<ResumeNotice migration={undefined} />)

    // A form that opens by announcing that nothing happened teaches people to
    // dismiss the notice without reading it, which is how the one that matters
    // gets missed.
    expect(container.firstChild).toBeNull()
  })
})

describe('when answers were set aside', () => {
  test('it says how many and names them', () => {
    render(<ResumeNotice migration={LOSSY} />)

    const notice = screen.getByRole('region', { name: /changed/i })
    expect(within(notice).getByText(/nickname/)).toBeTruthy()
    expect(within(notice).getByText(/fax/)).toBeTruthy()
  })

  test('it says the answers were kept, not deleted', () => {
    render(<ResumeNotice migration={LOSSY} />)

    // The thing somebody actually wants to know. "Two answers were removed"
    // reads as data loss; they are still in the submission under `__orphaned`,
    // and saying so is the difference between a warning and a fright.
    expect(screen.getByText(/still/i)).toBeTruthy()
  })

  test('it takes focus, so it is not missed on a page somebody scrolled', () => {
    render(<ResumeNotice migration={LOSSY} />)

    const notice = screen.getByRole('region', { name: /changed/i })
    expect(document.activeElement).toBe(notice)
  })

  test('it is not also a live region, which would announce it twice', () => {
    render(<ResumeNotice migration={LOSSY} />)

    const notice = screen.getByRole('region', { name: /changed/i })
    // The same reasoning ErrorSummary carries: focusing a container already
    // announces it, so role="alert" or aria-live on top of that is the classic
    // double-announcement bug.
    expect(notice.getAttribute('role')).toBe('region')
    expect(notice.getAttribute('aria-live')).toBeNull()
  })

  test('a label the caller supplies is used instead of the field key', () => {
    render(<ResumeNotice migration={LOSSY} labels={{ nickname: 'What we should call you' }} />)

    // `nickname` is the key the schema used; it is not what the question said.
    expect(screen.getByText(/What we should call you/)).toBeTruthy()
    // And one without a label still appears, rather than being dropped for
    // want of a nicer name.
    expect(screen.getByText(/fax/)).toBeTruthy()
  })
})

describe('when the form changed too much to rebind', () => {
  test('it says the draft is being shown as it was, and cannot be submitted', () => {
    render(<ResumeNotice migration={{ severity: 'breaking', changes: [] }} />)

    // The read-only case. Somebody looking at a form they cannot submit needs to
    // be told that before they fill it in again, not after.
    expect(screen.getByRole('region', { name: /changed/i })).toBeTruthy()
    expect(screen.getByText(/cannot be submitted/i)).toBeTruthy()
  })
})
