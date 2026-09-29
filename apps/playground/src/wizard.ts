import type { FormSchema } from '@formancy/spec'

/**
 * The second demo: a form with steps.
 *
 * `starter.ts` is one flat form on purpose — every field type the spec defines
 * **minus the two that nest** — so every control a visitor might want to try is on
 * screen at once. What that cost was invisible until somebody asked for a demo of
 * the wizard work: the playground held no `page` and no `group`, so it never drew
 * a stepper, never showed a step being walked past, and gave the builder's
 * container commands nothing to act on. `p`, `u` and `w` were three releases of
 * work with nowhere to see them.
 *
 * So this document exists to hold what a flat one cannot, and it is small on
 * purpose: three steps, a group inside one, a repeater inside another, and the
 * three rule kinds no demo carried — `skip`, `check` and `disabled`.
 *
 * **What to try.** Leave the visa box unticked and press Next: step two is not
 * there, because `skip` walks past a page while its condition holds and hides the
 * fields on it, which is what stops a required answer on a page nobody saw from
 * holding the form up. Tick it and the step appears. On the last step, type
 * anything into the reference: the field goes busy for a moment and then answers,
 * because a `check` is a validator the deployment answers rather than an
 * expression — `FM-1234` is the shape this deployment knows.
 *
 * **Only the step names are translated.** The starter demonstrates a catalogue
 * halfway through a translation; repeating that here would be the same lesson
 * twice. Translating the steps is the part worth seeing in a wizard, because the
 * stepper names them and a step name is the one label a person reads before they
 * have answered anything.
 */
export const WIZARD_SCHEMA = {
  specVersion: '3',
  id: 'trip-request',
  title: 'Trip request',
  model: {
    fields: [
      {
        key: 'traveller',
        type: 'page',
        label: { $t: 'step.traveller' },
        fields: [
          {
            key: 'guide',
            type: 'static',
            label:
              'Three steps. Leave the visa box below unticked and press Next: step two is skipped, and its questions go with it.',
          },
          { key: 'fullName', type: 'text', label: 'Full name', required: true },
          { key: 'workEmail', type: 'text', label: 'Work email', format: 'email', required: true },

          // A group: a form inside the form, and the one construct that changes
          // the shape of the answer. `address.town`, not `town`.
          {
            key: 'address',
            type: 'group',
            label: 'Where you are based',
            fields: [
              { key: 'street', type: 'text', label: 'Street' },
              { key: 'town', type: 'text', label: 'Town' },
              {
                key: 'country',
                type: 'select',
                label: 'Country',
                options: [
                  { value: 'CH', label: 'Switzerland' },
                  { value: 'DE', label: 'Germany' },
                  { value: 'FR', label: 'France' },
                ],
              },
            ],
          },

          { key: 'needsVisa', type: 'checkbox', label: 'I need a visa for this trip' },
        ],
      },

      {
        key: 'visa',
        type: 'page',
        label: { $t: 'step.visa' },
        fields: [
          // Required, and on a page that can be skipped. That combination is the
          // reason `skip` hides the fields rather than only jumping over the step:
          // a required answer nobody was shown would hold the form up at submit
          // with an error pointing at a page the person never saw.
          { key: 'passport', type: 'text', label: 'Passport number', required: true },
          { key: 'passportExpires', type: 'date', label: 'Expires' },
        ],
      },

      {
        key: 'trip',
        type: 'page',
        label: { $t: 'step.trip' },
        fields: [
          { key: 'departs', type: 'date', label: 'Departs', required: true },
          { key: 'returns', type: 'date', label: 'Returns' },

          // A repeater INSIDE a page, which the flat demo cannot show: validating
          // the step before leaving it has to consider every row.
          {
            key: 'legs',
            type: 'repeater',
            label: 'Legs',
            fields: [
              { key: 'from', type: 'text', label: 'From' },
              { key: 'to', type: 'text', label: 'To' },
              { key: 'nights', type: 'number', label: 'Nights' },
            ],
          },

          {
            key: 'referenceHint',
            type: 'static',
            label:
              'The reference is checked by this deployment rather than by an expression, which is why it takes a moment. FM-1234 is a shape it knows.',
          },
          { key: 'reference', type: 'text', label: 'Cost centre reference' },

          { key: 'addNotes', type: 'checkbox', label: 'I want to add notes' },
          { key: 'notes', type: 'textarea', label: 'Notes' },
        ],
      },
    ],
  },

  logic: {
    rules: [
      // The page is walked past while this holds, and its questions are hidden
      // with it. Read off an answer on an EARLIER step, which is the only place a
      // skip's condition can be answered: a condition reading the page it decides
      // about could only ever be false when it mattered.
      // `!= true` rather than `!needsVisa`, and that is not style. An untouched
      // checkbox is null, CEL refuses `!null`, and a rule that errors fails CLOSED
      // — so the page was never skipped, in any state, and the demo would have
      // shipped showing the feature not working. Measured against a real engine
      // before this line was changed; `wizard.test.ts` now holds it by building
      // one, because a document whose rules do not fire is the exact
      // documented-but-inert failure a demo exists to prevent.
      { target: 'visa', kind: 'skip', cel: 'needsVisa != true' },

      // No `cel` at all: a check names a validator and carries no expression,
      // because a CEL expression is synchronous by construction. `demo-checks.ts`
      // is the deployment that answers this one.
      // `runsOn` is NOT optional here in practice, and finding that out is most of
      // why this demo exists. A check with none defaults to `server` in the engine
      // — the safe default, since only the server can always answer one — while
      // the JSON Schema declares `runsOn`'s default as `both`. Written the obvious
      // way the check never ran in the browser and nothing said so: no error, no
      // request, an answer accepted that was never checked.
      { target: 'reference', kind: 'check', check: 'known-reference', runsOn: 'both' },

      // `disabled`, which no demo carried. Not the same as hidden: the control
      // stays on screen and stays announced, so somebody can see the question they
      // have not opted into rather than wondering where it went.
      { target: 'notes', kind: 'disabled', cel: 'addNotes != true' },
    ],
  },

  i18n: {
    defaultLocale: 'en',
    messages: {
      en: {
        'step.traveller': 'About you',
        'step.visa': 'Visa details',
        'step.trip': 'The trip',
      },
      de: {
        'step.traveller': 'Über Sie',
        'step.visa': 'Visum',
        'step.trip': 'Die Reise',
      },
      // French deliberately absent rather than half-written: with no catalogue at
      // all the engine falls back to the default locale for every step, which is
      // the behaviour a deployment adding a language sees on its first day.
    },
  },
} as unknown as FormSchema
