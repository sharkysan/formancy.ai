import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { render, screen, within } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { FormancyResumeNotice } from './resume-notice'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/**
 * The same assertions the React suite makes, against the same wording.
 *
 * Two renderers agreeing about what a form TELLS somebody matters as much as
 * them agreeing about what it collects — and this is the one place a difference
 * would not be caught by the conformance fixtures, which drive a form rather
 * than a resume.
 */
const LOSSY = {
  severity: 'lossy' as const,
  changes: [
    { kind: 'field.removed', path: 'nickname' },
    { kind: 'field.removed', path: 'fax' },
  ],
}

const mount = async (inputs: Record<string, unknown>) => {
  const view = await render(FormancyResumeNotice, {
    componentInputs: inputs,
    providers: [provideZonelessChangeDetection()],
  })
  await view.fixture.whenStable()
  return view
}

test('an unchanged draft renders nothing at all', async () => {
  await mount({ migration: undefined })

  // A form that opens by announcing that nothing happened teaches people to
  // dismiss the notice without reading it.
  expect(screen.queryByRole('region')).toBeNull()
})

describe('when answers were set aside', () => {
  test('it names them and says they were kept', async () => {
    await mount({ migration: LOSSY })

    const notice = screen.getByRole('region', { name: /changed/i })
    expect(within(notice).getByText(/nickname/)).toBeTruthy()
    expect(within(notice).getByText(/fax/)).toBeTruthy()
    // "Two answers were removed" reads as data loss; they are still in the
    // submission, and saying so is the difference between a warning and a
    // fright.
    expect(within(notice).getByText(/still/i)).toBeTruthy()
  })

  test('it takes focus and is not also a live region', async () => {
    await mount({ migration: LOSSY })

    const notice = screen.getByRole('region', { name: /changed/i })
    expect(document.activeElement).toBe(notice)
    // Focusing a container already announces it, so role="alert" or aria-live
    // on top would announce it twice.
    expect(notice.getAttribute('aria-live')).toBeNull()
  })

  test('a caller-supplied label is used instead of the field key', async () => {
    await mount({ migration: LOSSY, labels: { nickname: 'What we should call you' } })

    expect(screen.getByText(/What we should call you/)).toBeTruthy()
    // And one without a label still appears rather than being dropped.
    expect(screen.getByText(/fax/)).toBeTruthy()
  })
})

test('a breaking change says the draft cannot be submitted', async () => {
  await mount({ migration: { severity: 'breaking', changes: [] } })

  expect(screen.getByText(/cannot be submitted/i)).toBeTruthy()
})
