import type { FormSchema } from '@formancy/spec'

/**
 * The form the page renders for real, halfway down.
 *
 * Not a screenshot and not a mock-up: this is a formancy document handed to
 * `@formancy/react`, with the same engine, the same ARIA wiring and the same
 * theme a consumer would get. A landing page for a form engine that shows a
 * picture of a form is a landing page arguing against its own product.
 *
 * It has to make four claims visible without becoming a demo somebody has to
 * study — conditional logic, a computed value, the field types spec 2 added,
 * and a layout that is more than a stack. Tabs are what let the last two fit:
 * the document is twice the size it was and the form is the same height,
 * because only one panel is shown at a time.
 */
export const DEMO_SCHEMA: FormSchema = {
  specVersion: '2',
  id: 'site-demo',
  title: 'Request a quote',
  model: {
    fields: [
      { key: 'company', type: 'text', label: 'Company', required: true },
      {
        key: 'seats',
        type: 'number',
        label: 'Seats',
        required: true,
        min: 1,
        max: 5000,
      },
      {
        key: 'plan',
        type: 'radio',
        label: 'Plan',
        required: true,
        options: [
          { value: 'self', label: 'Self-hosted' },
          { value: 'cloud', label: 'Managed cloud' },
        ],
      },
      { key: 'region', type: 'select', label: 'Region', options: [
        { value: 'ch', label: 'Switzerland' },
        { value: 'eu', label: 'European Union' },
        { value: 'us', label: 'United States' },
      ] },
      { key: 'monthly', type: 'number', label: 'Estimated monthly (CHF)' },
      {
        key: 'topics',
        type: 'selectboxes',
        label: 'What the quote should cover',
        options: [
          { value: 'migration', label: 'Migrating forms we already have' },
          { value: 'audit', label: 'An accessibility audit' },
          { value: 'support', label: 'Support with a response time' },
        ],
      },
      {
        key: 'brief',
        type: 'richtext',
        label: 'Anything else we should know',
        maxLength: 600,
      },
      {
        key: 'existing',
        type: 'file',
        label: 'The forms you are migrating',
        accept: ['application/pdf'],
        maxFileSize: 5 * 1024 * 1024,
      },
    ],
  },
  logic: {
    rules: [
      // Only the managed plan needs a region: self-hosting happens wherever
      // the container is. The field disappears and its answer goes with it.
      { target: 'region', kind: 'visible', cel: "plan == 'cloud'" },
      { target: 'region', kind: 'required', cel: "plan == 'cloud'" },
      // `4.0`, not `4`. CEL is strongly typed and a JSON number is a double, so
      // `seats * 4` is double times int — a type error that leaves the field
      // silently empty rather than saying anything. Worth knowing about.
      { target: 'monthly', kind: 'computed', cel: 'seats * 4.0' },
      // A selectboxes answer is the list of values ticked, so a rule reads it
      // as a list. Asking for the old forms before anybody said they had any
      // is the sort of field a form grows until nobody fills it in.
      { target: 'existing', kind: 'visible', cel: "'migration' in topics" },
    ],
  },
  layouts: [
    {
      name: 'web',
      nodes: [
        {
          // The strip is named, because a form may have two of them and
          // "tab list" twice tells a screen-reader user nothing.
          kind: 'tabs',
          label: 'Quote',
          children: [
            {
              kind: 'section',
              label: 'Requirement',
              children: [
                {
                  // A table rather than two rows: columns that line up across
                  // rows are the one thing stacked rows cannot do, because
                  // each row sizes itself.
                  kind: 'table',
                  columns: 2,
                  children: [
                    { kind: 'field', path: 'company' },
                    { kind: 'field', path: 'seats' },
                    { kind: 'field', path: 'plan' },
                    { kind: 'field', path: 'region' },
                  ],
                },
                { kind: 'field', path: 'monthly' },
              ],
            },
            {
              kind: 'section',
              label: 'Detail',
              children: [
                { kind: 'field', path: 'topics' },
                { kind: 'field', path: 'brief' },
                { kind: 'field', path: 'existing' },
              ],
            },
          ],
        },
      ],
    },
  ],
}

/**
 * The same document, as an author writes it.
 *
 * Shown beside the rendered form so the two can be read against each other.
 * Trimmed to the parts that carry the argument: the whole document is on the
 * playground, and a wall of JSON on a landing page is a wall.
 */
export const DEMO_SOURCE = `{
  "specVersion": "2",
  "model": { "fields": [
    { "key": "company", "type": "text" },
    { "key": "seats",   "type": "number" },
    { "key": "plan",    "type": "radio" },
    { "key": "region",  "type": "select" },
    { "key": "monthly", "type": "number" },
    { "key": "topics",  "type": "selectboxes" },
    { "key": "brief",   "type": "richtext" },
    { "key": "existing","type": "file",
      "accept": ["application/pdf"] }
  ]},
  "logic": { "rules": [
    { "target": "region",
      "kind": "visible",
      "cel": "plan == 'cloud'" },
    { "target": "monthly",
      "kind": "computed",
      "cel": "seats * 4.0" },
    { "target": "existing",
      "kind": "visible",
      "cel": "'migration' in topics" }
  ]},
  "layouts": [{ "name": "web", "nodes": [
    { "kind": "tabs", "children": [
      { "kind": "section", "label": "Requirement",
        "children": [
          { "kind": "table", "columns": 2,
            "children": [
              "company", "seats", "plan", "region"
            ]},
          "monthly"
        ]},
      { "kind": "section", "label": "Detail",
        "children": [
          "topics", "brief", "existing"
        ]}
    ]}
  ]}]
}`
