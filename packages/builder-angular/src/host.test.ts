import { provideZonelessChangeDetection, reflectComponentType } from '@angular/core'
import type { Type } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, test } from 'vitest'
import * as kit from './index'

/**
 * The element Angular draws each of this package's components in takes no part in layout.
 *
 * The React builder has no such element. A theme places a part by its `data-formancy-part`,
 * often as a grid item or a flex item, and a host element that is a box is the item instead.
 * `formancy-translation-review` was one. It draws nothing on the default language, and it
 * still took the first cell of the translations pane's two columns, so the table moved to
 * the narrow one and the preview moved down under it. The renderer met the same thing in a
 * table layout ([0073](../../../docs/decisions/0073-a-host-element-is-not-a-layout.md)), and
 * the builder had not followed it ([0174](../../../docs/decisions/0174-the-builders-hosts-take-no-part-in-layout.md)).
 *
 * Every component the package can draw, found from what it exports through the components
 * each one imports. That way a component added later is held to this without anybody listing
 * it. jsdom performs no layout, so what is asserted is the declaration, and
 * `scripts/builders-layout-browser-test.mjs` measures the layout it produces in a browser.
 */

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/**
 * What the compiler wrote on a component class. `dependencies` is not public API: it is the
 * template's imports, as Angular resolved them, and nothing public lists them.
 */
interface Compiled {
  ɵcmp?: { dependencies?: readonly unknown[] | (() => readonly unknown[]) | null }
}

function everyComponent(): Map<string, Type<unknown>> {
  const found = new Map<string, Type<unknown>>()
  const visit = (candidate: unknown): void => {
    if (typeof candidate !== 'function') return
    const mirror = reflectComponentType(candidate as Type<unknown>)
    if (mirror === null || found.has(mirror.selector)) return
    found.set(mirror.selector, candidate as Type<unknown>)
    const imported = (candidate as Compiled).ɵcmp?.dependencies
    for (const dependency of (typeof imported === 'function' ? imported() : imported) ?? []) {
      visit(dependency)
    }
  }
  for (const exported of Object.values(kit)) visit(exported)
  return found
}

const components = everyComponent()
/**
 * Drawn in an element of its own: a selector naming a custom element. A component on an
 * element it describes, `div[formancyRuleVerdict]`, is the part itself and stays a box.
 */
const hosted = [...components].filter(([selector]) => /^[a-z][a-z0-9]*-[a-z0-9-]*$/.test(selector))

describe('the element each component is drawn in', () => {
  // Without these the list below could be empty, or miss what is only imported, and pass.
  test('is found for every component, the ones only imported by another as well', () => {
    expect(hosted.map(([selector]) => selector)).toEqual(
      expect.arrayContaining([
        'formancy-builder',
        'formancy-translation-review',
        'formancy-logic-comparison',
        'formancy-layout-add',
      ]),
    )
  })

  // A component on an element it describes keeps its box: it is the part a theme places.
  test('is left alone where the component is the part, not a wrapper around it', () => {
    expect([...components.keys()]).toContain('div[formancyRuleVerdict]')
    expect(hosted.map(([selector]) => selector)).not.toContain('div[formancyRuleVerdict]')
  })

  test.each(hosted)(
    '<%s> takes no part in layout, so a theme places what it draws as it places the React builder’s',
    (_selector, component) => {
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] })
      // Created and not rendered: the constructor is where the declaration is made, and no
      // input is read before the first change detection.
      const fixture = TestBed.createComponent(component)
      try {
        expect(getComputedStyle(fixture.nativeElement as HTMLElement).display).toBe('contents')
      } finally {
        fixture.destroy()
      }
    },
  )

  // A component style is a `<style>` element, which `style-src 'self'` blocks with no nonce,
  // and the box would come back under exactly the deployment the product says needs no CSP
  // configuration (0079). CSSOM is governed by no directive.
  test('is undone without a stylesheet, so a strict style-src needs no nonce', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] })
    // All of them alive while the document is read: Angular takes a component's `<style>`
    // out again when its last instance is destroyed, and this passed with one in place.
    const fixtures = hosted.map(([, component]) => TestBed.createComponent(component))
    try {
      const injected = [...document.querySelectorAll('style')].map((style) => style.textContent ?? '')
      expect(injected.filter((text) => text.includes('contents'))).toEqual([])
      for (const fixture of fixtures) {
        expect(getComputedStyle(fixture.nativeElement as HTMLElement).display).toBe('contents')
      }
    } finally {
      for (const fixture of fixtures) fixture.destroy()
    }
  })
})
