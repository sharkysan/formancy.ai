import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import compatibility from '../../../compatibility.json'
import { AngularBuilderPage, STARTER, testedOn } from './angular-builder-page.js'

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
})
