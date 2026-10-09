import type { FormSchema } from '@formancy/spec'
import catalog from '../../../templates/catalog.json'
import { STARTER_SCHEMA } from './starter.js'
import { WIZARD_SCHEMA } from './wizard.js'

/**
 * The two demo documents, and why there are two.
 *
 * The starter is one flat form on purpose — every field type the spec defines
 * **minus the two that nest** — so every control a visitor might want to try is
 * on screen at once, with nothing to press Next through. The cost of that was
 * invisible until somebody asked for a demo of the wizard work: this page held no
 * `page` and no `group` at all, so it never drew a stepper, never showed a step
 * being walked past, and gave the builder's container commands nothing to act on.
 *
 * Adding a page to the starter would have taken away the thing that makes it
 * work, to demonstrate a page. So the obligation is on the pair, and
 * `wizard.test.ts` holds it there: between the two of them, every field type and
 * every rule kind the format defines is on screen somewhere, derived from the
 * spec's own lists rather than from a list here that would go stale.
 */
interface Demo { id: string; label: string; schema: FormSchema }

const areas: Record<string, string> = {
  hr: 'HR', sales: 'Sales', 'customer-service': 'Customer service',
  events: 'Events', operations: 'Operations', 'healthcare-administration': 'Healthcare administration',
}

// Only form documents enter the browser bundle. Sample answers and validation
// scenarios live alongside them for integrators, never as defaults in a live form.
const forms = import.meta.glob<FormSchema>('../../../templates/**/*.form.json', {
  eager: true, import: 'default',
})

export const DEMOS: readonly Demo[] = [
  { id: 'starter', label: 'Everything — one form, every field type', schema: STARTER_SCHEMA },
  { id: 'wizard', label: 'A wizard — steps, a group, a skipped page', schema: WIZARD_SCHEMA },
  ...catalog.templates.map((entry): Demo => {
    const schema = forms[`../../../templates/${entry.schema}`]
    if (schema === undefined) throw new Error(`Missing template: ${entry.schema}`)
    return { id: entry.id, label: `${areas[entry.area]} — ${entry.title.en}`, schema }
  }),
]

/** A gallery link names a document, never an arbitrary URL to fetch. */
export function initialDemo(search: string): Demo {
  const id = new URLSearchParams(search).get('template')
  return DEMOS.find((demo) => demo.id === id) ?? DEMOS[0]!
}

/**
 * `?dir=rtl` reads the whole playground right to left — the forms and both builders —
 * which is the only way a visitor can see that they follow the reading order without
 * opening the developer tools (0123). Anything else is left to right.
 */
export function initialDirection(search: string): 'ltr' | 'rtl' {
  return new URLSearchParams(search).get('dir') === 'rtl' ? 'rtl' : 'ltr'
}

export function initialLocale(search: string): 'en' | 'de' | 'fr' {
  const locale = new URLSearchParams(search).get('locale')
  return locale === 'de' || locale === 'fr' ? locale : 'en'
}
