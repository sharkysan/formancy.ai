import type { Scenario } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import catalog from '../../../templates/catalog.json'
import { STARTER_SCHEMA } from './starter.js'
import { STARTER_SAMPLE, STARTER_SCENARIOS } from './starter-scenarios.js'
import { STARTER_SUGGESTIONS } from './starter-suggestions.js'
import type { Suggestion } from './suggestions.js'
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
interface Demo {
  id: string
  label: string
  schema: FormSchema
  examples: Examples | undefined
  /**
   * What to try with a model on this form, drawn beside the panes that ask one. Only the
   * starter's: each is about its fields, and chosen for what it shows there.
   */
  suggestions: readonly Suggestion[] | undefined
}

/**
 * What a form is supposed to do, written down (0110), and where every example starts.
 *
 * Per form, because an example names that form's fields: the starter's, run against a
 * template, failed on questions the template does not ask. The wizard has none, and says so.
 */
export interface Examples {
  readonly scenarios: readonly Scenario[]
  readonly sample: Readonly<Record<string, unknown>>
}

const areas: Record<string, string> = {
  hr: 'HR', sales: 'Sales', 'customer-service': 'Customer service',
  events: 'Events', operations: 'Operations', 'healthcare-administration': 'Healthcare administration',
}

// The form documents, and beside each the examples it is checked against and the
// fictional sample they start from — for the builders' examples panel, never as
// defaults in a live form: a sample name appearing as an answer is how a template
// ships somebody else's data (templates.test.tsx holds that).
const forms = import.meta.glob<FormSchema>('../../../templates/**/*.form.json', {
  eager: true, import: 'default',
})
const scenarios = import.meta.glob<Scenario[]>('../../../templates/**/*.scenarios.json', {
  eager: true, import: 'default',
})
const samples = import.meta.glob<Record<string, unknown>>('../../../templates/**/*.sample.json', {
  eager: true, import: 'default',
})

/** A catalogue file by its path, which must exist: a typo is a build error, not a blank pane. */
function shipped<T>(files: Record<string, T>, path: string): T {
  const file = files[`../../../templates/${path}`]
  if (file === undefined) throw new Error(`Missing template file: ${path}`)
  return file
}

export const DEMOS: readonly Demo[] = [
  {
    id: 'starter',
    label: 'Everything — one form, every field type',
    schema: STARTER_SCHEMA,
    examples: { scenarios: STARTER_SCENARIOS, sample: STARTER_SAMPLE },
    suggestions: STARTER_SUGGESTIONS,
  },
  {
    id: 'wizard',
    label: 'A wizard — steps, a group, a skipped page',
    schema: WIZARD_SCHEMA,
    examples: undefined,
    suggestions: undefined,
  },
  ...catalog.templates.map(
    (entry): Demo => ({
      id: entry.id,
      label: `${areas[entry.area]} — ${entry.title.en}`,
      schema: shipped(forms, entry.schema),
      examples: {
        scenarios: shipped(scenarios, entry.scenarios),
        sample: shipped(samples, entry.sample),
      },
      suggestions: undefined,
    }),
  ),
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
