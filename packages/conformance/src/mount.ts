import type { MountOptions } from './driver.js'
import type { Fixture } from './types.js'
import type { FixtureProblem } from './validate.js'
import { asRecord } from './values.js'

/*
 * What a fixture mounts with — its starting answers, the locale and the layout — as the
 * options a driver is handed, and the refusals for a locale or a layout that would make a
 * case assert nothing. One file because adding a mount option is one change: the option
 * here, its refusal here, and the field on `Fixture` and `MountOptions`.
 */

/** The options a driver mounts a fixture with: only those the fixture names. */
export function mountOptionsFor({ initialValues, locale, layout }: Fixture): MountOptions {
  return {
    ...(initialValues && { initialValues }),
    ...(locale !== undefined && { locale }),
    ...(layout !== undefined && { layout }),
  }
}

/** Why a fixture's locale or layout would make it assert nothing; empty when neither does. */
export function validateMount(fixture: Readonly<Record<string, unknown>>): FixtureProblem[] {
  return [
    ...validateLocale(fixture['locale'], fixture['schema']),
    ...validateLayout(fixture['layout'], fixture['schema']),
  ]
}

/**
 * The locale a fixture asks to be mounted in.
 *
 * Refused when the document carries no catalogue for it. `resolveText` falls
 * back to the default locale for anything it cannot find — right in a product,
 * and fatal here: the case would render wholly in the source language, find
 * every control by its source-language name and pass while certifying nothing.
 * A fixture that cannot fail is worse than one that is missing.
 */
function validateLocale(value: unknown, schema: unknown): FixtureProblem[] {
  if (value === undefined) return []
  if (typeof value !== 'string' || value === '') {
    return [{ path: 'locale', message: 'expected a non-empty string' }]
  }

  const messages = asRecord(asRecord(asRecord(schema)?.['i18n'])?.['messages'])
  if (asRecord(messages?.[value]) !== undefined) return []
  return [
    {
      path: 'locale',
      message: `no catalogue for "${value}": the fixture would fall back to the default locale and assert nothing`,
    },
  ]
}

/**
 * The layout a fixture mounts with, which the document must have: a renderer given a name it
 * cannot find draws model order, and the fixture would then assert nothing about the layout.
 */
function validateLayout(value: unknown, schema: unknown): FixtureProblem[] {
  if (value === undefined) return []
  if (typeof value !== 'string' || value === '') {
    return [{ path: 'layout', message: 'expected a non-empty string' }]
  }
  const layouts = asRecord(schema)?.['layouts']
  const named =
    Array.isArray(layouts) && layouts.some((layout) => asRecord(layout)?.['name'] === value)
  if (named) return []
  return [
    {
      path: 'layout',
      message: `no layout called "${value}": the form would be drawn in model order and assert nothing about the layout`,
    },
  ]
}
