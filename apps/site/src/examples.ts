import type { FormSchema } from '@formancy/spec'

/**
 * The forms the page renders for real.
 *
 * Not screenshots and not mock-ups: each is a formancy document handed to
 * `@formancy/react`, with the same engine, the same ARIA wiring and the same
 * theme a consumer would get. A landing page for a form engine that shows a
 * picture of a form is a landing page arguing against its own product.
 *
 * Three rather than one, because "request a quote" is the form every product
 * page already shows and nobody has ever wanted to fill in. These are forms
 * somebody might actually want: a ticket, a bug report, a night in a hut.
 * Between them they carry every claim the page makes — conditional fields,
 * computed prices, list answers read by a rule, formatted text that is parsed
 * rather than trusted, attachments, and layouts that are more than a stack.
 *
 * Every one of them is checked by the site's tests with the same two checks
 * the MCP server runs on an agent's document: the spec validator, and the
 * expression check that catches a rule which compiles and then never does
 * anything. A landing page whose demo form quietly computes nothing is worse
 * than one with no demo at all.
 */
export interface Example {
  id: string
  /** The file name the document is shown under. */
  file: string
  title: string
  /** One line: what to try first, so the logic is found rather than hunted for. */
  hint: string
  schema: FormSchema
}

const MB = 1024 * 1024

const ticket: FormSchema = {
  specVersion: '2',
  id: 'edge-summit-ticket',
  title: 'Edge Summit · Zürich 2027',
  model: {
    fields: [
      { key: 'name', type: 'text', label: 'Full name', required: true },
      { key: 'email', type: 'text', label: 'Email', required: true, format: 'email' },
      {
        key: 'ticket',
        type: 'radio',
        label: 'Ticket',
        required: true,
        options: [
          { value: 'conference', label: 'Conference · CHF 390' },
          { value: 'pro', label: 'Conference + workshops · CHF 690' },
          { value: 'student', label: 'Student · CHF 120' },
        ],
      },
      {
        key: 'workshops',
        type: 'selectboxes',
        label: 'Pick your workshops',
        options: [
          { value: 'agents', label: 'Shipping AI agents to production' },
          { value: 'a11y', label: 'Accessibility, keyboard first' },
          { value: 'edge', label: 'Rendering at the edge' },
        ],
      },
      {
        key: 'enrolment',
        type: 'file',
        label: 'Proof of enrolment',
        accept: ['application/pdf', 'image/png', 'image/jpeg'],
        maxFileSize: 5 * MB,
        maxItems: 1,
      },
      { key: 'nights', type: 'number', label: 'Hotel nights · CHF 180 each', min: 0, max: 4 },
      { key: 'total', type: 'number', label: 'Total (CHF)' },
    ],
  },
  logic: {
    rules: [
      // Workshops only exist on the ticket that includes them. Hidden, the
      // field's answer is pruned — a conference ticket cannot smuggle a
      // workshop seat into the submission.
      { target: 'workshops', kind: 'visible', cel: "ticket == 'pro'" },
      { target: 'enrolment', kind: 'visible', cel: "ticket == 'student'" },
      { target: 'enrolment', kind: 'required', cel: "ticket == 'student'" },
      // `180.0`, not `180`: a number field holds a double and CEL will not
      // widen a whole number to meet it. The check in the tests is what
      // catches the version without the decimal point.
      {
        target: 'total',
        kind: 'computed',
        cel: "(ticket == 'pro' ? 690.0 : ticket == 'student' ? 120.0 : 390.0) + nights * 180.0",
      },
    ],
  },
  layouts: [
    {
      name: 'web',
      nodes: [
        {
          kind: 'table',
          columns: 2,
          children: [
            { kind: 'field', path: 'name' },
            { kind: 'field', path: 'email' },
          ],
        },
        { kind: 'field', path: 'ticket' },
        { kind: 'field', path: 'workshops' },
        { kind: 'field', path: 'enrolment' },
        {
          kind: 'table',
          columns: 2,
          children: [
            { kind: 'field', path: 'nights' },
            { kind: 'field', path: 'total' },
          ],
        },
      ],
    },
  ],
}

const bug: FormSchema = {
  specVersion: '2',
  id: 'bug-report',
  title: 'Report a bug',
  model: {
    fields: [
      { key: 'summary', type: 'text', label: 'What went wrong?', required: true, maxLength: 120 },
      {
        key: 'severity',
        type: 'radio',
        label: 'Severity',
        required: true,
        options: [
          { value: 'blocker', label: 'Blocker · production is down' },
          { value: 'major', label: 'Major · there is a workaround' },
          { value: 'minor', label: 'Minor · it looks wrong' },
        ],
      },
      { key: 'affected', type: 'number', label: 'Users affected, roughly', min: 1 },
      { key: 'page', type: 'checkbox', label: 'Page the on-call engineer now' },
      {
        key: 'platforms',
        type: 'selectboxes',
        label: 'Where does it happen?',
        options: [
          { value: 'web', label: 'Web' },
          { value: 'ios', label: 'iOS' },
          { value: 'android', label: 'Android' },
          { value: 'api', label: 'Public API' },
        ],
      },
      {
        key: 'apiVersion',
        type: 'select',
        label: 'API version',
        options: [
          { value: 'v2', label: 'v2' },
          { value: 'v3', label: 'v3' },
          { value: 'v4-beta', label: 'v4 beta' },
        ],
      },
      { key: 'steps', type: 'richtext', label: 'Steps to reproduce', maxLength: 1200 },
      {
        key: 'evidence',
        type: 'file',
        label: 'Screenshot or recording',
        accept: ['image/png', 'image/jpeg', 'video/mp4'],
        maxFileSize: 10 * MB,
        maxItems: 3,
      },
    ],
  },
  logic: {
    rules: [
      // Only a blocker asks how bad it is — and then it has to be answered.
      { target: 'affected', kind: 'visible', cel: "severity == 'blocker'" },
      { target: 'affected', kind: 'required', cel: "severity == 'blocker'" },
      { target: 'page', kind: 'visible', cel: "severity == 'blocker'" },
      // A selectboxes answer is the list of values ticked, so a rule reads it
      // as a list.
      { target: 'apiVersion', kind: 'visible', cel: "'api' in platforms" },
      { target: 'apiVersion', kind: 'required', cel: "'api' in platforms" },
    ],
  },
  layouts: [
    {
      name: 'web',
      nodes: [
        {
          // Named, because a form may have two strips and "tab list" twice
          // tells a screen-reader user nothing.
          kind: 'tabs',
          label: 'Bug report',
          children: [
            {
              kind: 'section',
              label: 'Impact',
              children: [
                { kind: 'field', path: 'summary' },
                { kind: 'field', path: 'severity' },
                { kind: 'field', path: 'affected' },
                { kind: 'field', path: 'page' },
              ],
            },
            {
              kind: 'section',
              label: 'Details',
              children: [
                { kind: 'field', path: 'platforms' },
                { kind: 'field', path: 'apiVersion' },
                { kind: 'field', path: 'steps' },
                { kind: 'field', path: 'evidence' },
              ],
            },
          ],
        },
      ],
    },
  ],
}

const hut: FormSchema = {
  specVersion: '2',
  id: 'hut-booking',
  title: 'A night on the mountain',
  model: {
    fields: [
      {
        key: 'hut',
        type: 'select',
        label: 'Hut',
        required: true,
        options: [
          { value: 'silberhorn', label: 'Silberhorn hut · 2,695 m' },
          { value: 'gletscherblick', label: 'Gletscherblick · 3,012 m' },
          { value: 'laerchenwald', label: 'Lärchenwald lodge · 1,840 m' },
        ],
      },
      { key: 'arrival', type: 'date', label: 'Arrival', required: true },
      { key: 'nights', type: 'number', label: 'Nights', required: true, min: 1, max: 7 },
      { key: 'guests', type: 'number', label: 'Guests', required: true, min: 1, max: 12 },
      { key: 'halfBoard', type: 'checkbox', label: 'Half board · dinner and breakfast' },
      {
        key: 'diet',
        type: 'selectboxes',
        label: 'Anything the kitchen should know?',
        options: [
          { value: 'vegetarian', label: 'Vegetarian' },
          { value: 'vegan', label: 'Vegan' },
          { value: 'gluten', label: 'Gluten-free' },
        ],
      },
      { key: 'total', type: 'number', label: 'Total (CHF)' },
    ],
  },
  logic: {
    rules: [
      // `== true`, not bare `halfBoard`: a checkbox nobody has touched is null,
      // and the engine refuses a visibility rule that is not certain to be a
      // bool rather than guess.
      { target: 'diet', kind: 'visible', cel: 'halfBoard == true' },
      // The whole price in one expression: a bed at 65, half board at 48 on
      // top, per guest per night. The server recomputes it from the answers
      // rather than believing the number the browser sent.
      {
        target: 'total',
        kind: 'computed',
        cel: 'nights * guests * (halfBoard == true ? 113.0 : 65.0)',
      },
    ],
  },
  layouts: [
    {
      name: 'web',
      nodes: [
        { kind: 'field', path: 'hut' },
        {
          kind: 'table',
          columns: 3,
          children: [
            { kind: 'field', path: 'arrival' },
            { kind: 'field', path: 'nights' },
            { kind: 'field', path: 'guests' },
          ],
        },
        { kind: 'field', path: 'halfBoard' },
        { kind: 'field', path: 'diet' },
        { kind: 'field', path: 'total' },
      ],
    },
  ],
}

export const EXAMPLES: readonly Example[] = [
  {
    id: 'ticket',
    file: 'ticket.json',
    title: 'Conference ticket',
    hint: 'Pick the workshop ticket, then add a hotel night — watch the total.',
    schema: ticket,
  },
  {
    id: 'bug',
    file: 'bug-report.json',
    title: 'Bug report',
    hint: 'Call it a blocker. Then tick “Public API” on the second tab.',
    schema: bug,
  },
  {
    id: 'hut',
    file: 'hut.json',
    title: 'Mountain hut',
    hint: 'Two nights, two guests, half board — the price follows.',
    schema: hut,
  },
]
