import type { Scenario } from '@formancy/core'

/**
 * What the starter form is supposed to do, written down.
 *
 * The playground's demo is where somebody goes to find out what this product
 * is, and the scenario pane beside it is only a feature if there is something
 * in it. An empty list would show the panel and demonstrate nothing — the
 * documented-and-inert shape this repository has shipped once.
 *
 * These are also the honest kind rather than the flattering kind. Each one
 * pins a rule that **compiles whichever way round it is written**:
 * `country == "CH"` and `country != "CH"` are both valid CEL, both satisfy
 * the validator, the engine's compile and the expression checker, and only an
 * example with its answer written down can tell them apart
 * ([0110](../../../docs/decisions/0110-a-form-is-checked-against-examples.md)).
 *
 * They live beside the document rather than inside it, which is the shape the
 * builders take them in: a host owns them, and a host putting them in a file
 * next to the form gets a CI gate out of the same file.
 */

/**
 * Where every scenario starts: the form filled in, and valid.
 *
 * Without it the starter's required fields make every scenario report the
 * same six `required` errors, none of them about the rule the scenario is
 * for. The templates carry the same thing under the name `sample`, and this
 * is what made the pane grow an `initialValue` — found by pointing it at this
 * form rather than at a three-field one.
 *
 * Fictional, and deliberately not a default: nothing here is pre-filled in
 * the demo, because a sample name appearing as an answer is how a template
 * ships somebody else's data.
 */
export const STARTER_SAMPLE: Readonly<Record<string, unknown>> = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  country: 'DE',
  terms: true,
  items: [{ name: 'A widget', qty: 1, unitPrice: 10 }],
  recipients: [{ who: 'Reception' }],
}

export const STARTER_SCENARIOS: readonly Scenario[] = [
  {
    /*
     * The conditional, in the direction that is easy to invert. Written the
     * other way round the form asks a Swiss canton of everybody except the
     * Swiss, and nothing but this notices.
     */
    name: 'Switzerland asks for a canton',
    changes: { country: 'CH' },
    valid: false,
    visible: { canton: true },
    errors: { canton: ['required'] },
  },
  {
    name: 'and nowhere else does',
    changes: { country: 'DE' },
    visible: { canton: false },
    valid: true,
  },
  {
    // A bound, and the reason `time` carries one at all. A control without
    // `earliest` shows a control; one with it shows what a bound does.
    name: 'a delivery window outside working hours is refused',
    changes: { deliveryWindow: '05:30' },
    valid: false,
    errors: { deliveryWindow: ['earliest'] },
  },
  {
    name: 'and one inside them is not',
    changes: { deliveryWindow: '10:30' },
    valid: true,
  },
  {
    /*
     * A pattern, which is the constraint a model most often writes slightly
     * wrong. Four or five digits: three is not a postcode anywhere this form
     * is for.
     */
    name: 'a postcode has to look like one',
    changes: { postcode: '12' },
    valid: false,
    errors: { postcode: ['pattern'] },
  },
]
