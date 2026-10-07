import { describe, expect, test } from 'vitest'
import { describeConformance } from '@formancy/conformance'
import { createReactDriver } from './conformance-driver.js'

/**
 * The moment the architecture pays off or does not: the SAME fixtures that
 * specify the engine's semantics, driven through the real React renderer by
 * accessible name and role only. A failure here is a renderer bug or a
 * semantics disagreement — either way, exactly what this suite exists to catch.
 */
describeConformance(() => createReactDriver(), {
  name: 'React renderer conformance',
  test: { describe, test },
})

/**
 * The driver honours the locale it is mounted with.
 *
 * Held here rather than by a fixture, and the reason is a guard trap this
 * repository keeps meeting. The suite finds every control by accessible name,
 * and the driver resolves that name itself — so a driver that drops
 * `MountOptions.locale` mounts an English form *and* looks up English names,
 * agrees with itself, and passes a German fixture while nothing is translated.
 * Reverting the forwarding reddened nothing; the two halves cancel.
 *
 * What the fixture does catch is a *renderer* that ignores the locale while
 * its driver honours it, which is the shape a third-party renderer would have.
 * This case covers the other half, by asking the page a question the driver
 * cannot answer for itself: is the German string on it?
 *
 * `MountOptions.locale` existed for a long time, documented as something a
 * driver "may ignore", and both drivers did
 * ([0107](../../../docs/decisions/0107-layout-text-is-read-in-the-engines-locale.md)).
 */
describe('the React driver', () => {
  test('mounts in the locale it is given, not the document default', async () => {
    const driver = createReactDriver()
    await driver.mount({
      specVersion: '1',
      id: 'mounted',
      title: 'Mounted',
      model: { fields: [{ key: 'email', type: 'text', label: { $t: 'email' } }] },
      i18n: { defaultLocale: 'en', messages: { en: { email: 'Email address' }, de: { email: 'E-Mail-Adresse' } } },
    } as never, { locale: 'de' })

    // Read off the document, not through the driver: the driver resolving the
    // name is exactly the thing that cannot be trusted to report on itself.
    const text = document.body.textContent ?? ''
    expect(text, 'the page is in the document default, so the locale was dropped').toContain(
      'E-Mail-Adresse',
    )
    expect(text).not.toContain('Email address')

    await driver.unmount?.()
  })
})
