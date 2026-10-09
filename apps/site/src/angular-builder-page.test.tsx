import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import compatibility from '../../../compatibility.json'
import { AngularBuilderPage, STARTER, SURVEYJS_CHECKED, testedOn } from './angular-builder-page.js'

/**
 * `/angular-form-builder/`. Its prose is the kind that drifts, so what can be derived is —
 * the versions, the save-and-reload code — and the two snippets written by hand are held to
 * the packages they name by `apps/docs/src/site-snippets.test.ts`, which can read the
 * repository; this app has no Node types on purpose (0008).
 */
afterEach(cleanup)

describe('the Angular form builder page', () => {
  test('is one document: one heading level one, and the demo reachable by a skip link', () => {
    render(<AngularBuilderPage />)

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Skip to the demo' }).getAttribute('href')).toBe(
      '#demo',
    )
  })

  test('shows the starter itself, live, rather than a picture of it', () => {
    render(<AngularBuilderPage />)

    const demo = screen.getByTitle('The Angular starter: a form builder and the form it builds')
    expect(demo.tagName).toBe('IFRAME')
    expect(demo.getAttribute('src')).toBe(STARTER)
  })

  test('names the versions CI runs, read from the file CI reads', () => {
    render(<AngularBuilderPage />)
    const versions = within(screen.getByRole('region', { name: 'Tested on' }))

    for (const list of [compatibility.angular, compatibility.react, compatibility.node]) {
      expect(versions.getByText(testedOn(list), { exact: false })).toBeTruthy()
    }
    expect(testedOn(['22.0.0', '^22'])).toBe('22.0.0 and the newest 22')
  })

  test('compares with SurveyJS part by part, dated and pointing at SurveyJS’s own pages', () => {
    // A statement about somebody else's licence is true on a day. Undated, it is a claim
    // this repository cannot keep true, about a thing it does not control.
    render(<AngularBuilderPage />)
    const section = within(
      screen.getByRole('region', { name: 'If you are comparing it with SurveyJS' }),
    )

    const table = section.getByRole('table', { name: 'formancy and SurveyJS, part by part' })
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((row) => row.textContent),
    ).toEqual([
      'The renderer — draws a form, collects the answers',
      'The visual builder — where forms are edited',
      'The backend — keeps forms and answers, checks what comes back',
      'PDF and dashboards',
    ])
    expect(section.getByText(new RegExp(SURVEYJS_CHECKED))).toBeTruthy()
    const sources = section
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '')
      .filter((href) => href.startsWith('https://surveyjs.io/'))
    expect(sources).toHaveLength(3)
  })
})
