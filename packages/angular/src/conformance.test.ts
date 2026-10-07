import { describe, expect, test } from 'vitest'
import { describeConformance } from '@formancy/conformance'
import { createAngularDriver } from './conformance-driver'

/**
 * The moment the architecture pays off or does not: the SAME fixtures that
 * specify the engine's semantics and certify the React renderer, driven
 * through the real Angular renderer by accessible name and role only. A
 * failure here is a renderer bug or a semantics disagreement — either way,
 * exactly what this suite exists to catch.
 */
describeConformance(() => createAngularDriver(), {
  name: 'Angular renderer conformance',
  test: { describe, test },
})

/**
 * The driver honours the locale it is mounted with. The same case as
 * packages/react/src/conformance.test.tsx, for the same reason.
 *
 * It cannot be a fixture: the suite finds every control by accessible name and
 * the driver resolves that name itself, so a driver that drops
 * `MountOptions.locale` mounts an English form, looks up English names, agrees
 * with itself and passes a German fixture while nothing is translated.
 * Reverting the forwarding in either driver reddened nothing
 * ([0107](../../../docs/decisions/0107-layout-text-is-read-in-the-engines-locale.md)).
 */
describe('the Angular driver', () => {
  test('mounts in the locale it is given, not the document default', async () => {
    const driver = createAngularDriver()
    await driver.mount({
      specVersion: '1',
      id: 'mounted',
      title: 'Mounted',
      model: { fields: [{ key: 'email', type: 'text', label: { $t: 'email' } }] },
      i18n: { defaultLocale: 'en', messages: { en: { email: 'Email address' }, de: { email: 'E-Mail-Adresse' } } },
    } as never, { locale: 'de' })

    // Read off the document, not through the driver: the driver resolving the
    // name is exactly what cannot be trusted to report on itself.
    const text = document.body.textContent ?? ''
    expect(text, 'the page is in the document default, so the locale was dropped').toContain(
      'E-Mail-Adresse',
    )
    expect(text).not.toContain('Email address')

    await driver.unmount?.()
  })
})
