import type { FormSchema } from '@formancy/spec'

/**
 * The schema the playground opens with.
 *
 * Small enough to read, but exercising every headline behaviour at once:
 * every field type the spec defines, a side-by-side layout, a conditional, a
 * computed value, per-row validation on a repeater, a required consent box,
 * and three message catalogues.
 *
 * **Version 2, and it has to be.** The intro says "every field type the spec
 * defines", and for a while that sentence was false: the document declared
 * version 1, so `selectboxes`, `file` and `richtext` were not in it — and the
 * builder correctly refused to add one, because a version 1 document may not
 * contain a version 2 construct. The form said it had everything and the
 * palette said no. A claim in a demo is a claim.
 *
 * Every piece of text a person reads is a `$t` reference rather than a
 * literal, so the locale switcher has something to switch. French is
 * deliberately incomplete — which is what a translation looks like halfway
 * through, and the engine falls back to the default locale for the rest
 * rather than printing a message id at somebody.
 */
export const STARTER_SCHEMA = {
  specVersion: '2',
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

      // A time of day carries no zone, so it is not an instant: `09:00`–`17:00`
      // means those hours wherever the reader is. The bounds are here so the demo
      // shows what a bound does, not merely that the control exists.
      { key: 'deliveryWindow', type: 'time', label: { $t: 'deliveryWindow' }, earliest: '09:00', latest: '17:00' },

      // A datetime IS an instant, stored as UTC. The control shows the reader their
      // own wall clock and the answer records the moment — which is why the two
      // types are separate rather than one with a flag.
      { key: 'confirmedAt', type: 'datetime', label: { $t: 'confirmedAt' } },

      {
        key: 'items',
        type: 'repeater',
        label: { $t: 'items' },
        minItems: 1,
        addLabel: 'Add item',
        removeLabel: 'Remove item',
        // No widget, on purpose: this is the repeater as STACKED ROWS, and the
        // `recipients` repeater below is the same construct with
        // `widget: 'datagrid'`. Two of them, side by side in one form, because the
        // widget's whole claim is that it changes how a repeater LOOKS and nothing
        // about what it collects -- and that claim is worth being able to see rather
        // than only read.
        fields: [
          { key: 'name', type: 'text', label: { $t: 'items.name' }, required: true },
          { key: 'qty', type: 'number', label: { $t: 'items.qty' }, min: 1 },
          { key: 'unitPrice', type: 'number', label: { $t: 'items.unitPrice' } },
          // Computed per row, and never typed into.
          { key: 'lineTotal', type: 'number', label: { $t: 'items.lineTotal' } },
        ],
      },

      // The same construct as `items` above, with `widget: 'datagrid'`. Three short
      // answers per row, deliberately: a grid earns its keep when the columns line up
      // and the values are narrow enough to scan down, and it earns nothing when four
      // wide answers are squeezed into a pane. `items` stays stacked so both readings
      // are on the page at once.
      {
        key: 'recipients',
        type: 'repeater',
        label: { $t: 'recipients' },
        minItems: 1,
        addLabel: 'Add recipient',
        removeLabel: 'Remove recipient',
        widget: 'datagrid',
        // `width` is a ratio, never a length: a length in a document would be the format
        // choosing the consumer's design system for them. A name needs the room; an
        // amount does not, and `align: 'end'` lines the figures up on their last digit.
        //
        // `note` is in no column at all, and that is the demonstration: a child a column
        // does not name still collects, so it still gets a column, appended in
        // declaration order. Delete a column here and the answer keeps its place rather
        // than vanishing.
        columns: [
          { field: 'who', width: 3 },
          { field: 'amount', width: 1, align: 'end', header: 'CHF' },
        ],
        fields: [
          { key: 'who', type: 'text', label: { $t: 'recipients.who' }, required: true },
          { key: 'amount', type: 'number', label: { $t: 'recipients.amount' }, min: 10 },
          { key: 'note', type: 'text', label: { $t: 'recipients.note' } },
        ],
      },

      // `widget: 'scanner'` on a text field: a camera route to a value somebody could
      // otherwise type. The playground supplies the scanner — see `app.tsx` — because a
      // widget nobody can see working is a widget that is only documented. The
      // `pattern` is here for the same reason a `time` field carries a bound: scan
      // something that does not match it and the engine refuses it exactly as it
      // refuses a typed answer, which is the whole claim about what a widget may do.
      { key: 'voucher', type: 'text', widget: 'scanner', label: { $t: 'voucher' }, pattern: '[A-Z0-9]{6}' },

      { key: 'notes', type: 'textarea', label: { $t: 'notes' }, maxLength: 500 },
      // selectboxes: several answers from one list. The answer is the list of
      // values ticked, in the options' own order.
      {
        key: 'extras',
        type: 'selectboxes',
        label: { $t: 'extras' },
        options: [
          { value: 'giftwrap', label: { $t: 'extras.giftwrap' } },
          { value: 'insurance', label: { $t: 'extras.insurance' } },
          { value: 'signature', label: { $t: 'extras.signature' } },
        ],
      },
      // `widget: 'typeahead'` on a select: type to narrow a long list. Twelve
      // options rather than two, because a type-ahead over a list somebody can
      // read at a glance demonstrates nothing -- the widget exists for the list
      // that is too long to scroll.
      //
      // The option labels are literals and every other piece of text here is a
      // `$t` reference. That is deliberate and it is the one honest exception: a
      // language's own name is the same in every locale, which is what an endonym
      // is for. They also carry the diacritics the filter has to fold, so typing
      // `francais` or `turkce` finds a row on a keyboard that cannot produce
      // either -- which is the behaviour, not the decoration.
      {
        key: 'cardLanguage',
        type: 'select',
        widget: 'typeahead',
        label: { $t: 'cardLanguage' },
        options: [
          { value: 'de', label: 'Deutsch' },
          { value: 'fr', label: 'Français' },
          { value: 'it', label: 'Italiano' },
          { value: 'rm', label: 'Rumantsch' },
          { value: 'en', label: 'English' },
          { value: 'es', label: 'Español' },
          { value: 'pt', label: 'Português' },
          { value: 'nl', label: 'Nederlands' },
          { value: 'pl', label: 'Polski' },
          { value: 'tr', label: 'Türkçe' },
          { value: 'cs', label: 'Čeština' },
          { value: 'sv', label: 'Svenska' },
        ],
      },
      // richtext: formatted text stored as a closed grammar, never HTML. The
      // field shows a live preview from the same parser that will render it.
      { key: 'message', type: 'richtext', label: { $t: 'message' }, maxLength: 500 },
      // file: the submission stores what each file is and where it went, never
      // its bytes. With no uploader configured the field says so plainly,
      // which is what the playground shows: it has no server behind it.
      {
        key: 'artwork',
        type: 'file',
        label: { $t: 'artwork' },
        accept: ['image/png', 'image/jpeg', 'application/pdf'],
        maxFileSize: 5 * 1024 * 1024,
      },

      // `widget: 'toggle'` is the author saying how it should look, and nothing
      // more: still a checkbox, still role `checkbox`, still true/false/untouched.
      // Here so the demo shows the widget rather than only documenting it.
      { key: 'terms', type: 'checkbox', widget: 'toggle', label: { $t: 'terms' }, required: true },
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
                // Placed here as well as declared in the model. Adding the two
                // temporal fields to the model alone made them INVISIBLE: this form
                // renders a named layout, and a layout places what it names.
                { kind: 'field', path: 'deliveryWindow' },
                { kind: 'field', path: 'confirmedAt' },
              ],
            },
            { kind: 'field', path: 'items' },
        { kind: 'field', path: 'recipients' },
            { kind: 'field', path: 'voucher' },
          ],
        },
        {
          // tabs: one panel at a time, and presentation only — a field in a
          // closed tab is still validated and still submitted, so the strip
          // opens the tab an error is in.
          kind: 'tabs',
          label: { $t: 'tabs' },
          children: [
            {
              kind: 'section',
              label: { $t: 'tab.extras' },
              children: [
                {
                  // table: columns that line up across rows, which stacked
                  // rows cannot do because each row sizes itself.
                  //
                  // And `span`, which is the other half of a grid. Two short answers
                  // take a column each; the rich-text editor and the file dropzone take
                  // the whole width, because a control somebody works INSIDE is not a
                  // control they answer in a word. Measured before `span` existed: both
                  // sat at 266px against 548px for a field in the flow.
                  //
                  // `'all'` rather than `2`, and the demo says so on purpose: change
                  // `columns` to 3 and these two stay full width, where a number would
                  // silently have become two thirds.
                  kind: 'table',
                  columns: 2,
                  children: [
                    { kind: 'field', path: 'extras' },
                    { kind: 'field', path: 'cardLanguage' },
                    { kind: 'field', path: 'message', span: 'all' },
                    { kind: 'field', path: 'artwork', span: 'all' },
                  ],
                },
                // A code node: a second VIEW of an answer placed elsewhere, collecting
                // nothing of its own. Out of the box it shows the value as text and no
                // picture — encoding one is a dependency for something a design system
                // may want to draw its own way, so a consumer registers a component for
                // the drawing. Here so the demo shows the node rather than only
                // documenting it.
                { kind: 'qrcode', path: 'email', label: { $t: 'emailCode' } },
              ],
            },
            {
              // `source` is deliberately left out of every arrangement: it is
              // a hidden field, it renders nothing, and a tab holding one
              // would be an empty panel. The arrangement pane names it as
              // unplaced, which is the honest way to show a field that
              // travels with the submission without being on the screen.
              kind: 'section',
              label: { $t: 'tab.notes' },
              children: [{ kind: 'field', path: 'notes' }],
            },
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
      // A rule reading a LIST answer. Untouched, `extras` is `[]` rather than
      // null, which is why this is false before the first tick instead of
      // failing and showing the field it was meant to hide.
      { target: 'artwork', kind: 'visible', cel: "'giftwrap' in extras" },
    ],
  },

  i18n: {
    defaultLocale: 'en',
    messages: {
      en: {
        intro: 'Every field type except the two that nest, in one form.',
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
        deliveryWindow: 'Delivery window',
        emailCode: 'Your email as a code',
        confirmedAt: 'Confirmed at',
        items: 'Items',
        recipients: 'Who the cards are for',
        'recipients.who': 'Recipient',
        'recipients.amount': 'Amount',
        'recipients.note': 'Note',
        'items.name': 'Name',
        'items.qty': 'Quantity',
        'items.unitPrice': 'Unit price',
        'items.lineTotal': 'Line total',
        voucher: 'Voucher code',
        notes: 'Notes',
        tabs: 'Extras and anything else',
        'tab.extras': 'Extras',
        'tab.notes': 'Anything else',
        extras: 'Add to your order',
        'extras.giftwrap': 'Gift wrapping',
        'extras.insurance': 'Insurance',
        'extras.signature': 'Signature on delivery',
        cardLanguage: 'Language on the gift card',
        message: 'A message on the gift card',
        artwork: 'Artwork for the gift wrap',
        terms: 'I accept the terms',
        source: 'Source',
      },
      de: {
        intro: 'Jeder Feldtyp ausser den zwei verschachtelnden, in einem Formular.',
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
        deliveryWindow: 'Lieferfenster',
        emailCode: 'Ihre E-Mail als Code',
        confirmedAt: 'Bestätigt am',
        items: 'Positionen',
        recipients: 'Für wen die Karten sind',
        'recipients.who': 'Empfängerin',
        'recipients.amount': 'Betrag',
        'recipients.note': 'Notiz',
        'items.name': 'Bezeichnung',
        'items.qty': 'Menge',
        'items.unitPrice': 'Einzelpreis',
        'items.lineTotal': 'Zeilensumme',
        voucher: 'Gutscheincode',
        notes: 'Bemerkungen',
        tabs: 'Extras und Sonstiges',
        'tab.extras': 'Extras',
        'tab.notes': 'Sonstiges',
        extras: 'Zur Bestellung hinzufügen',
        'extras.giftwrap': 'Geschenkverpackung',
        'extras.insurance': 'Versicherung',
        'extras.signature': 'Unterschrift bei Zustellung',
        cardLanguage: 'Sprache der Geschenkkarte',
        message: 'Eine Nachricht auf der Geschenkkarte',
        artwork: 'Motiv für die Geschenkverpackung',
        terms: 'Ich akzeptiere die Bedingungen',
        source: 'Quelle',
      },
      // Deliberately partial. Switch to French and the untranslated labels
      // stay English rather than turning into message ids: an untranslated
      // label is a small problem, `items.qty` on the screen is a large one.
      fr: {
        intro: 'Chaque type de champ sauf les deux imbriqués, dans un formulaire.',
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
        recipients: 'Pour qui sont les cartes',
        'recipients.who': 'Destinataire',
        'recipients.amount': 'Montant',
        'recipients.note': 'Note',
        extras: 'Ajouter à votre commande',
        'extras.giftwrap': 'Emballage cadeau',
      },
    },
  },
} satisfies FormSchema
