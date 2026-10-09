import { STARTER_MESSAGES } from './starter-messages.js'
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
/**
 * An option's picture, carried inside the document as a `data:image/svg+xml` address,
 * so the demo needs no image host and tells no third party who opened it (0126). A
 * mid-grey stroke, because a picture in an `<img>` does not inherit the page's colour
 * and has to read on a light theme and a dark one alike.
 */
const picture = (body: string): string =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 36" fill="none" stroke="#8a94a6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`,
  )}`

export const STARTER_SCHEMA = {
  specVersion: '4',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      // static: text the reader sees that collects nothing.
      { key: 'intro', type: 'static', label: { $t: 'intro' } },

      { key: 'firstName', type: 'text', label: { $t: 'firstName' }, required: true },
      { key: 'lastName', type: 'text', label: { $t: 'lastName' }, required: true },
      { key: 'email', type: 'text', label: { $t: 'email' }, format: 'email', required: true },
      // A mask: the control writes "+41" and the spaces, the answer holds the nine
      // digits typed. Paste "+41 79 123 45 67" and it is read as one number, not as
      // a 4 and a 1 followed by seven more.
      { key: 'phone', type: 'text', label: { $t: 'phone' }, mask: '+41 99 999 99 99' },

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
        // Pictures on the options: decoration here, since the label already says what
        // each one is — so no text alternative, and a screen reader hears the label alone.
        options: [
          {
            value: 'standard',
            label: { $t: 'delivery.standard' },
            image: { src: picture('<rect x="12" y="10" width="24" height="18" rx="2"/><path d="M12 16h24"/>') },
          },
          {
            value: 'express',
            label: { $t: 'delivery.express' },
            image: {
              src: picture(
                '<rect x="18" y="10" width="24" height="18" rx="2"/><path d="M18 16h24M4 14h9M7 20h7M4 26h9"/>',
              ),
            },
          },
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

      // `optionsSource`: a select whose answers come from the DEPLOYMENT rather than
      // from the document. The form says WHICH list — a name, never an address — and
      // `app.tsx` says what that name means. A URL here would be a deployment detail
      // in a portable format, unfixable once a version is published, and an SSRF
      // surface on an instance inside a private network.
      //
      // With the typeahead, because that is the case it exists for: a list too long
      // to write down and too long to scroll.
      {
        key: 'deliveryPoint',
        type: 'select',
        label: { $t: 'deliveryPoint' },
        widget: 'typeahead',
        optionsSource: 'pickup-points',
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

      // `widget: 'rating'` on a number: spec 4. An NPS question, which is this
      // widget's commonest use and needs no type of its own — 0 to 10 inclusive is
      // eleven options, and the off-by-one that makes a scale run 1 to 10 drops the
      // answer somebody meant. Bounds are not optional in practice: without them
      // there is no scale to draw and the control falls back to a number input, so
      // a demo without them would show the fallback and teach nothing.
      {
        key: 'recommend',
        type: 'number',
        widget: 'rating',
        label: { $t: 'recommend' },
        min: 0,
        max: 10,
      },
      // `widget: 'slider'` on a number, with a `step` — because a slider without
      // one is a control nobody can see the point of, and `step` is the property
      // spec 4 added for it. 1 to 5 in halves shows what a step DOES: the thumb
      // stops at 2.5, and the engine refuses 2.7 on the server as well, which is
      // why `step` is a field property rather than widget configuration.
      {
        key: 'portions',
        type: 'number',
        widget: 'slider',
        label: { $t: 'portions' },
        min: 1,
        max: 5,
        step: 0.5,
      },
      // ranking: options put in order, and the answer is that order. Spec 4's first new
      // type. Bounded to two, so ranking all three shows what a bound does — "your top
      // two" is `maxItems`, and the engine refuses a third on the server as well (0138).
      {
        key: 'priorities',
        type: 'ranking',
        label: { $t: 'priorities' },
        maxItems: 2,
        options: [
          { value: 'fresh', label: { $t: 'priorities.fresh' } },
          { value: 'local', label: { $t: 'priorities.local' } },
          { value: 'fast', label: { $t: 'priorities.fast' } },
        ],
      },
      // matrix: one question asked of several rows, the same answers for each. Required,
      // which for a matrix means every row: answer the taste and leave the delivery, and
      // the form is refused — a matrix half answered has not been answered (0139).
      {
        key: 'verdict',
        type: 'matrix',
        label: { $t: 'verdict' },
        required: true,
        rows: [
          { value: 'taste', label: { $t: 'verdict.taste' } },
          { value: 'delivery', label: { $t: 'verdict.delivery' } },
        ],
        options: [
          { value: 'poor', label: { $t: 'verdict.poor' } },
          { value: 'fine', label: { $t: 'verdict.fine' } },
          { value: 'great', label: { $t: 'verdict.great' } },
        ],
      },

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
      // `widget: 'tagpicker'` on a selectboxes: several answers narrowed by typing
      // and shown as chips. A long list rather than three, because a picker over
      // a list somebody can read at a glance demonstrates nothing -- the widget
      // exists for the list that is too long to tick through. Still an array of
      // offered values in the options' own order, which is what the selectboxes
      // above stores without it.
      {
        key: 'interests',
        type: 'selectboxes',
        widget: 'tagpicker',
        label: { $t: 'interests' },
        options: [
          { value: 'architecture', label: { $t: 'interests.architecture' } },
          { value: 'cycling', label: { $t: 'interests.cycling' } },
          { value: 'food', label: { $t: 'interests.food' } },
          { value: 'history', label: { $t: 'interests.history' } },
          { value: 'hiking', label: { $t: 'interests.hiking' } },
          { value: 'music', label: { $t: 'interests.music' } },
          { value: 'photography', label: { $t: 'interests.photography' } },
          { value: 'swimming', label: { $t: 'interests.swimming' } },
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

      // signature: a mark drawn with a pointer, or a name typed — both routes, because
      // typing is the only one a keyboard has. The `box` is the coordinate space the
      // points are recorded in, and `maxPoints` bounds one answer: with a bound in the
      // demo, the field shows what a bound does rather than only that a control exists.
      {
        key: 'signedBy',
        type: 'signature',
        label: { $t: 'signedBy' },
        box: [600, 180],
        maxPoints: 2000,
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
            { kind: 'field', path: 'phone' },
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
            { kind: 'field', path: 'recommend' },
            { kind: 'field', path: 'portions' },
            { kind: 'field', path: 'priorities' },
            { kind: 'field', path: 'verdict' },
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
                    // Spanning, because chips wrap and a half-width row of them
                    // reads as a wall rather than as a list.
                    { kind: 'field', path: 'interests', span: 'all' },
                    { kind: 'field', path: 'cardLanguage' },
                    { kind: 'field', path: 'deliveryPoint' },
                    { kind: 'field', path: 'message', span: 'all' },
                    { kind: 'field', path: 'artwork', span: 'all' },
                    // Spanning, because a signing box that is half a row wide is a
                    // box nobody can sign in.
                    { kind: 'field', path: 'signedBy', span: 'all' },
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
      // A rule on a field in a repeater row, as the builder's condition editor writes
      // it: the CEL compiled from the `editor` metadata beside it. It runs once per
      // row, with `item` bound to that row, so a large amount asks for a note in
      // that recipient's row and no other. Open the Rules tab to read it in words, and row by
      // row what it does now.
      {
        target: 'recipients[].note',
        kind: 'required',
        cel: 'item.amount != null && item.amount >= 1000.0',
        editor: {
          join: 'all',
          conditions: [
            { field: 'recipients[].amount', operator: 'isAtLeast', value: 1000, answer: 'number' },
          ],
        },
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
    messages: STARTER_MESSAGES,
  },
} satisfies FormSchema
