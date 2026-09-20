/**
 * The schema the playground opens with.
 *
 * Small enough to read, but exercising every headline behaviour at once:
 * every field type the spec defines, a side-by-side layout, a conditional, a
 * computed value, per-row validation on a repeater, a required consent box,
 * and three message catalogues.
 *
 * Every piece of text a person reads is a `$t` reference rather than a
 * literal, so the locale switcher has something to switch. French is
 * deliberately incomplete — which is what a translation looks like halfway
 * through, and the engine falls back to the default locale for the rest
 * rather than printing a message id at somebody.
 */
export const STARTER_SCHEMA = {
  specVersion: '1',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      // static: text the reader sees that collects nothing.
      { key: 'intro', type: 'static', label: { $t: 'intro' } },

      { key: 'firstName', type: 'text', label: { $t: 'firstName' }, required: true },
      { key: 'lastName', type: 'text', label: { $t: 'lastName' }, required: true },
      { key: 'email', type: 'text', label: { $t: 'email' }, format: 'email', required: true },

      {
        key: 'country',
        type: 'select',
        label: { $t: 'country' },
        options: [
          { value: 'CH', label: { $t: 'country.ch' } },
          { value: 'DE', label: { $t: 'country.de' } },
        ],
      },
      // Shown only for Switzerland — the conditional.
      { key: 'canton', type: 'text', label: { $t: 'canton' } },
      { key: 'postcode', type: 'text', label: { $t: 'postcode' }, pattern: '[0-9]{4,5}' },
      { key: 'city', type: 'text', label: { $t: 'city' } },

      {
        key: 'delivery',
        type: 'radio',
        label: { $t: 'delivery' },
        options: [
          { value: 'standard', label: { $t: 'delivery.standard' } },
          { value: 'express', label: { $t: 'delivery.express' } },
        ],
      },
      { key: 'wantedBy', type: 'date', label: { $t: 'wantedBy' } },

      {
        key: 'items',
        type: 'repeater',
        label: { $t: 'items' },
        minItems: 1,
        addLabel: 'Add item',
        removeLabel: 'Remove item',
        fields: [
          { key: 'name', type: 'text', label: { $t: 'items.name' }, required: true },
          { key: 'qty', type: 'number', label: { $t: 'items.qty' }, min: 1 },
          { key: 'unitPrice', type: 'number', label: { $t: 'items.unitPrice' } },
          // Computed per row, and never typed into.
          { key: 'lineTotal', type: 'number', label: { $t: 'items.lineTotal' } },
        ],
      },

      { key: 'notes', type: 'textarea', label: { $t: 'notes' }, maxLength: 500 },
      { key: 'terms', type: 'checkbox', label: { $t: 'terms' }, required: true },
      // hidden: travels with the submission, never shown.
      { key: 'source', type: 'hidden', label: { $t: 'source' } },
    ],
  },

  /**
   * A named arrangement of the same model: names on one line, the address on
   * another. The fields, their rules and their answers are unchanged — only
   * where they sit.
   *
   * The renderers place row children by source order alone and reflow to a
   * single column when there is no width for two, so the reading order, the
   * tab order and the visual order cannot come apart (WCAG 1.3.2, 2.4.3,
   * 1.4.10).
   */
  layouts: [
    {
      name: 'web',
      nodes: [
        { kind: 'field', path: 'intro' },
        {
          kind: 'section',
          label: { $t: 'section.you' },
          children: [
            {
              kind: 'row',
              children: [
                { kind: 'field', path: 'firstName' },
                { kind: 'field', path: 'lastName' },
              ],
            },
            { kind: 'field', path: 'email' },
          ],
        },
        {
          kind: 'section',
          label: { $t: 'section.where' },
          children: [
            { kind: 'field', path: 'country' },
            { kind: 'field', path: 'canton' },
            {
              kind: 'row',
              children: [
                { kind: 'field', path: 'postcode' },
                { kind: 'field', path: 'city' },
              ],
            },
          ],
        },
        {
          kind: 'section',
          label: { $t: 'section.order' },
          children: [
            {
              kind: 'row',
              children: [
                { kind: 'field', path: 'delivery' },
                { kind: 'field', path: 'wantedBy' },
              ],
            },
            { kind: 'field', path: 'items' },
            { kind: 'field', path: 'notes' },
          ],
        },
        { kind: 'field', path: 'terms' },
      ],
    },
  ],

  logic: {
    rules: [
      { target: 'canton', kind: 'visible', cel: 'country == "CH"' },
      { target: 'canton', kind: 'required', cel: 'country == "CH"' },
      // A computed value, per repeater row: `item` is the row being evaluated.
      {
        target: 'items[].lineTotal',
        kind: 'computed',
        cel: '(item.qty == null || item.unitPrice == null) ? 0.0 : item.qty * item.unitPrice',
      },
      {
        target: 'items[].qty',
        kind: 'validate',
        cel: 'item.qty == null || item.qty > 0.0',
        code: 'notPositive',
      },
      // Express delivery needs a date; standard does not.
      { target: 'wantedBy', kind: 'required', cel: 'delivery == "express"' },
    ],
  },

  i18n: {
    defaultLocale: 'en',
    messages: {
      en: {
        intro: 'Every field type the spec defines, in one form.',
        'section.you': 'About you',
        'section.where': 'Where it goes',
        'section.order': 'What you want',
        firstName: 'First name',
        lastName: 'Last name',
        email: 'Email',
        country: 'Country',
        'country.ch': 'Switzerland',
        'country.de': 'Germany',
        canton: 'Canton',
        postcode: 'Postcode',
        city: 'Town or city',
        delivery: 'Delivery',
        'delivery.standard': 'Standard',
        'delivery.express': 'Express',
        wantedBy: 'Wanted by',
        items: 'Items',
        'items.name': 'Name',
        'items.qty': 'Quantity',
        'items.unitPrice': 'Unit price',
        'items.lineTotal': 'Line total',
        notes: 'Notes',
        terms: 'I accept the terms',
        source: 'Source',
      },
      de: {
        intro: 'Jeder Feldtyp der Spezifikation, in einem Formular.',
        'section.you': 'Über Sie',
        'section.where': 'Lieferadresse',
        'section.order': 'Ihre Bestellung',
        firstName: 'Vorname',
        lastName: 'Nachname',
        email: 'E-Mail',
        country: 'Land',
        'country.ch': 'Schweiz',
        'country.de': 'Deutschland',
        canton: 'Kanton',
        postcode: 'Postleitzahl',
        city: 'Ort',
        delivery: 'Versand',
        'delivery.standard': 'Standard',
        'delivery.express': 'Express',
        wantedBy: 'Gewünscht bis',
        items: 'Positionen',
        'items.name': 'Bezeichnung',
        'items.qty': 'Menge',
        'items.unitPrice': 'Einzelpreis',
        'items.lineTotal': 'Zeilensumme',
        notes: 'Bemerkungen',
        terms: 'Ich akzeptiere die Bedingungen',
        source: 'Quelle',
      },
      // Deliberately partial. Switch to French and the untranslated labels
      // stay English rather than turning into message ids: an untranslated
      // label is a small problem, `items.qty` on the screen is a large one.
      fr: {
        intro: 'Chaque type de champ de la spécification, dans un formulaire.',
        'section.you': 'À votre sujet',
        'section.where': 'Adresse de livraison',
        firstName: 'Prénom',
        lastName: 'Nom',
        email: 'Courriel',
        country: 'Pays',
        'country.ch': 'Suisse',
        'country.de': 'Allemagne',
        canton: 'Canton',
        postcode: 'Code postal',
        city: 'Localité',
        items: 'Postes',
      },
    },
  },
}
