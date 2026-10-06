import { CONTAINER_FIELD_TYPES, CURRENT_SPEC_VERSION, FIELD_TYPES, LIST_VALUED_FIELD_TYPES, SPEC_1_FIELD_TYPES, SPEC_VERSIONS, WIDGETS_BY_FIELD_TYPE, RULE_KINDS } from './types.js'
import { SPEC_1_LAYOUT_KINDS } from './layout.js'

/**
 * What somebody writing a formancy document from scratch has to be told.
 *
 * Here rather than in whatever is doing the asking, because there are now two
 * of them — the MCP tools and the builder's prompt pane — and a fact stated
 * twice is a fact that will be true in one place after the next spec change.
 * It is also the only honest home for it: this is knowledge about the format,
 * and the format lives here.
 *
 * The audience is a language model, and that shapes it. A model asked for an
 * email field writes `type: "email"`, because that is what every other form
 * builder calls it; told the list first, it writes `type: "text"` with
 * `format: "email"`. Every note below is something that has actually cost time
 * in this repository, which is the bar for adding another: not "worth knowing"
 * but "somebody got this wrong and nothing told them".
 */
export interface AuthoringFacts {
  readonly specVersions: readonly string[]
  readonly currentSpecVersion: string
  readonly fieldTypes: readonly string[]
  readonly fieldTypesInSpec1: readonly string[]
  readonly containerFieldTypes: readonly string[]
  readonly listValuedFieldTypes: readonly string[]
  readonly layoutKinds: readonly string[]
  /** Which presentations each field type accepts, as `type: widget, widget`. */
  readonly widgetsByFieldType: Readonly<Record<string, readonly string[]>>
  readonly ruleKinds: readonly string[]
  readonly formats: readonly string[]
  /** The traps, in the order somebody falls into them. */
  readonly notes: readonly string[]
}

export function authoringFacts(): AuthoringFacts {
  return {
    specVersions: SPEC_VERSIONS,
    currentSpecVersion: CURRENT_SPEC_VERSION,
    fieldTypes: FIELD_TYPES,
    fieldTypesInSpec1: SPEC_1_FIELD_TYPES,
    containerFieldTypes: CONTAINER_FIELD_TYPES,
    listValuedFieldTypes: LIST_VALUED_FIELD_TYPES,
    layoutKinds: [...SPEC_1_LAYOUT_KINDS, 'tabs', 'table', 'qrcode'],
    widgetsByFieldType: WIDGETS_BY_FIELD_TYPE,
    // From the constant rather than typed out: the list was a literal and had to
    // be edited when `check` arrived, which is how a briefing comes to describe a
    // format one version behind the one it is briefing about.
    ruleKinds: RULE_KINDS,
    formats: ['email', 'url', 'uuid'],
    notes: [
      'A field type not in the list does not exist, whatever other form builders call it. An email field is type "text" with format "email".',
      'A document may not contain a construct from a later version than the one it declares. The types selectboxes, time, datetime, file and richtext, the layout kinds tabs, table and qrcode, and the properties widget, columns, optionsSource, earliest, latest and span all need version 2; the type signature and the properties box and maxPoints need version 3. The schema is closed, so a reader of an earlier version refuses the whole document rather than ignoring the property it does not know.',
      'A widget says how a field looks and never what it stores, so it only goes on a type that accepts it. Asked for a switch, write a checkbox with widget "toggle"; for a grid of rows, a repeater with widget "datagrid".',
      'An empty answer for a list-valued field is [], never null. A rule reads it as a list.',
      'Expressions are CEL and are type-checked. A JSON number is a double, so write 4.0 rather than 4 when multiplying one.',
      'Field keys are identity. Renaming one is a migration, declared with renamedFrom, not an edit.',
      'A layout is optional. Without one the fields render in model order; with one, every field it does not place is invisible.',
    ],
  }
}

/**
 * The same facts as something a model reads.
 *
 * Prose rather than the JSON above, because a system prompt is read as
 * language: a list of keys makes a model guess at their meaning, and the
 * guesses are what the notes exist to prevent.
 */
export function authoringBriefing(): string {
  const facts = authoringFacts()
  return [
    'You are writing a formancy form document: JSON, validated against a published schema.',
    '',
    `Use specVersion "${facts.currentSpecVersion}".`,
    `Field types: ${facts.fieldTypes.join(', ')}.`,
    `Layout node kinds: ${facts.layoutKinds.join(', ')}.`,
    `Widgets, by the type that accepts them: ${Object.entries(facts.widgetsByFieldType)
      .map(([type, widgets]) => `${type}: ${widgets.join(', ')}`)
      .join('; ')}.`,
    `Rule kinds: ${facts.ruleKinds.join(', ')}. Formats: ${facts.formats.join(', ')}.`,
    '',
    'Rules that are not obvious:',
    ...facts.notes.map((note) => `- ${note}`),
    '',
    'Answer with the JSON document and nothing else. No commentary, no code fence.',
  ].join('\n')
}
