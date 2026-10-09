import { blockFrom, compileGroup, createBuilderText } from '@formancy/builder-core'
import type { BuilderBlock, ConditionGroup } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'

/**
 * "The country is Switzerland", as the condition editor writes it.
 *
 * Compiled rather than typed: inside a group a field nobody has answered is absent rather
 * than null, so a hand-written `billing.country == "CH"` fails to evaluate — and a rule
 * that fails shows the field, so the canton appeared for every country. The editor's CEL
 * guards with `has()`, and the metadata beside it is what the logic panel reopens.
 */
const SWITZERLAND: ConditionGroup = {
  join: 'all',
  conditions: [{ field: 'billing.country', operator: 'is', value: 'CH', answer: 'choice' }],
}

/**
 * The form the playground's first block is saved from: an address, the piece forms
 * repeat most.
 *
 * Its keys are the starter's own on purpose. The starter already has a country, a
 * canton, a postcode and a town, so inserting the block there shows what a form whose
 * keys are unique has to do with a second set: they become `country2` and `canton2`,
 * and the rule that shows the canton for Switzerland follows them.
 */
const ADDRESS_FORM = {
  specVersion: '4',
  id: 'address-block',
  title: 'Address',
  model: {
    fields: [
      {
        key: 'billing',
        type: 'group',
        label: { $t: 'billing' },
        fields: [
          { key: 'street', type: 'text', label: { $t: 'billing.street' } },
          {
            key: 'postcode',
            type: 'text',
            label: { $t: 'billing.postcode' },
            pattern: '[0-9]{4,5}',
          },
          { key: 'city', type: 'text', label: { $t: 'billing.city' } },
          {
            key: 'country',
            type: 'select',
            label: { $t: 'billing.country' },
            options: [
              { value: 'CH', label: { $t: 'billing.country.ch' } },
              { value: 'DE', label: { $t: 'billing.country.de' } },
            ],
          },
          { key: 'canton', type: 'text', label: { $t: 'billing.canton' } },
        ],
      },
    ],
  },
  logic: {
    rules: [
      {
        target: 'billing.canton',
        kind: 'visible',
        cel: compileGroup(SWITZERLAND),
        editor: SWITZERLAND,
      },
      {
        target: 'billing.canton',
        kind: 'required',
        cel: compileGroup(SWITZERLAND),
        editor: SWITZERLAND,
      },
    ],
  },
  i18n: {
    defaultLocale: 'en',
    messages: {
      en: {
        billing: 'Billing address',
        'billing.street': 'Street and number',
        'billing.postcode': 'Postcode',
        'billing.city': 'Town or city',
        'billing.country': 'Country',
        'billing.country.ch': 'Switzerland',
        'billing.country.de': 'Germany',
        'billing.canton': 'Canton',
      },
      de: {
        billing: 'Rechnungsadresse',
        'billing.street': 'Strasse und Nummer',
        'billing.postcode': 'Postleitzahl',
        'billing.city': 'Ort',
        'billing.country': 'Land',
        'billing.country.ch': 'Schweiz',
        'billing.country.de': 'Deutschland',
        'billing.canton': 'Kanton',
      },
      fr: {
        billing: 'Adresse de facturation',
        'billing.street': 'Rue et numéro',
        'billing.postcode': 'Code postal',
        'billing.city': 'Localité',
        'billing.country': 'Pays',
        'billing.country.ch': 'Suisse',
        'billing.country.de': 'Allemagne',
        'billing.canton': 'Canton',
      },
    },
  },
} satisfies FormSchema

/**
 * The blocks the playground offers before anybody has saved one
 * ([0135](../../../docs/decisions/0135-a-block-is-a-field-with-its-rules.md)).
 *
 * Saved with `blockFrom`, as a builder saves one, rather than written out by hand: a
 * block is the field, the rules that read only inside it and the words it names, and a
 * hand-written one could disagree with what saving produces without anything noticing.
 */
export const DEMO_BLOCKS: readonly BuilderBlock[] = [
  saved(ADDRESS_FORM, ['billing'], {
    id: 'demo-address',
    name: 'Address',
    description: 'Street, postcode, town and country — and a canton for Switzerland.',
  }),
]

function saved(
  form: FormSchema,
  keyPath: readonly string[],
  meta: { id: string; name: string; description: string },
): BuilderBlock {
  const outcome = blockFrom(form, keyPath, meta, createBuilderText())
  // A demo block that cannot be saved is this file's mistake, and the page would open
  // without it; failing here says which.
  if (!outcome.ok)
    throw new Error(`The demo block "${meta.name}" cannot be saved: ${outcome.message}`)
  return outcome.block
}
