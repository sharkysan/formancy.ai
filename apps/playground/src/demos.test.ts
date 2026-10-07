import { expect, test } from 'vitest'
import catalog from '../../../templates/catalog.json'
import { DEMOS, initialDemo, initialLocale } from './demos.js'

test('every downloadable template can be opened directly in the editor', () => {
  // The gallery links by id. A curated subset here would make some links silently
  // open the everything-demo instead of the form the visitor chose.
  for (const entry of catalog.templates) {
    expect(DEMOS.find((demo) => demo.id === entry.id)?.schema.id).toBe(entry.id)
    expect(initialDemo(`?template=${entry.id}`).schema.id).toBe(entry.id)
  }
})

test('unrecognised links fall back to the normal demo and locale', () => {
  // External links must not feed an undefined schema to the engine.
  expect(initialDemo('?template=missing').id).toBe('starter')
  expect(initialDemo('').id).toBe('starter')
  expect(initialLocale('?locale=de')).toBe('de')
  expect(initialLocale('?locale=fr')).toBe('fr')
  expect(initialLocale('?locale=missing')).toBe('en')
})
