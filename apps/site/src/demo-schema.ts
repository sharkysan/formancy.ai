import type { FormSchema } from '@formancy/spec'

/**
 * The form the page renders for real, halfway down.
 *
 * Not a screenshot and not a mock-up: this is a formancy document handed to
 * `@formancy/react`, with the same engine, the same ARIA wiring and the same
 * theme a consumer would get. A landing page for a form engine that shows a
 * picture of a form is a landing page arguing against its own product.
 *
 * Small on purpose. It has to make three claims visible in one screen —
 * conditional logic, a computed value, and a side-by-side row — and anything
 * more is a demo somebody has to study rather than notice.
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
    ],
  },
  layouts: [
    {
      name: 'web',
      nodes: [
        {
          kind: 'row',
          children: [
            { kind: 'field', path: 'company' },
            { kind: 'field', path: 'seats' },
          ],
        },
        {
          kind: 'row',
          children: [
            { kind: 'field', path: 'plan' },
            { kind: 'field', path: 'region' },
          ],
        },
        { kind: 'field', path: 'monthly' },
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
    { "key": "monthly", "type": "number" }
  ]},
  "logic": { "rules": [
    { "target": "region",
      "kind": "visible",
      "cel": "plan == 'cloud'" },
    { "target": "monthly",
      "kind": "computed",
      "cel": "seats * 4.0" }
  ]},
  "layouts": [{ "name": "web", "nodes": [
    { "kind": "row",
      "children": ["company", "seats"] },
    { "kind": "row",
      "children": ["plan", "region"] }
  ]}]
}`
