/**
 * The schema the playground opens with: small enough to read in one breath,
 * but exercising the headline behaviours — a conditional field, a computed
 * total over repeater rows, per-row validation and a required consent box.
 *
 * Every piece of text a person reads is a `$t` reference into the `i18n`
 * catalogues rather than a literal, so the locale switcher has something to
 * switch. That is also the honest way to demonstrate the feature: a form with
 * one language and a language picker proves nothing.
 *
 * Three locales, and the third is deliberately incomplete. French is missing
 * some messages, which is what a real translation looks like halfway through —
 * and the engine falls back to the default locale for those rather than
 * printing a message id at somebody.
 */
export const STARTER_SCHEMA = {
  specVersion: '1',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'customer', type: 'text', label: { $t: 'customer' }, required: true },
      {
        key: 'country',
        type: 'select',
        label: { $t: 'country' },
        options: [
          { value: 'CH', label: { $t: 'country.ch' } },
          { value: 'DE', label: { $t: 'country.de' } },
        ],
      },
      { key: 'canton', type: 'text', label: { $t: 'canton' } },
      {
        key: 'items',
        type: 'repeater',
        label: { $t: 'items' },
        minItems: 1,
        addLabel: 'Add item',
        removeLabel: 'Remove item',
        fields: [
          { key: 'name', type: 'text', label: { $t: 'items.name' }, required: true },
          { key: 'qty', type: 'number', label: { $t: 'items.qty' } },
        ],
      },
      { key: 'terms', type: 'checkbox', label: { $t: 'terms' }, required: true },
    ],
  },
  logic: {
    rules: [
      { target: 'canton', kind: 'visible', cel: 'country == "CH"' },
      {
        target: 'items[].qty',
        kind: 'validate',
        cel: 'item.qty == null || item.qty > 0.0',
        code: 'notPositive',
      },
    ],
  },
  i18n: {
    // Every reference must resolve HERE. validateSchema refuses a document
    // whose label points at a message nobody wrote, because the failure mode
    // is `items.qty` appearing in front of a customer.
    defaultLocale: 'en',
    messages: {
      en: {
        customer: 'Customer',
        country: 'Country',
        'country.ch': 'Switzerland',
        'country.de': 'Germany',
        canton: 'Canton',
        items: 'Items',
        'items.name': 'Name',
        'items.qty': 'Quantity',
        terms: 'I accept the terms',
      },
      de: {
        customer: 'Kundin oder Kunde',
        country: 'Land',
        'country.ch': 'Schweiz',
        'country.de': 'Deutschland',
        canton: 'Kanton',
        items: 'Positionen',
        'items.name': 'Bezeichnung',
        'items.qty': 'Menge',
        terms: 'Ich akzeptiere die Bedingungen',
      },
      // Deliberately partial: `items.name`, `items.qty` and `terms` are
      // missing. Switch to French and those three fall back to English rather
      // than showing their message ids — an untranslated label is a small
      // problem, `items.qty` on the screen is a large one.
      fr: {
        customer: 'Client',
        country: 'Pays',
        'country.ch': 'Suisse',
        'country.de': 'Allemagne',
        canton: 'Canton',
        items: 'Postes',
      },
    },
  },
}
