/**
 * What the validator says, by code, in English.
 *
 * Every reason a document is refused has a stable code and the values its sentence
 * names, and this is the English for each. The sentences were written inline where
 * each rule is checked; they live here so that something other than English can be
 * said for them — a builder speaking its author's language translates by code and
 * fills in the same values ([0122](../../../docs/decisions/0122-a-validator-error-has-a-code.md)).
 * A `SchemaError` still carries its English `message`, so nothing that read one
 * before reads anything different now.
 *
 * Placeholders are `{name}`, as in the builder's catalogue. A sentence that names a
 * thing names it through a value, never by being a variant of another sentence: one
 * code per sentence, so a translation is a sentence and not a fragment.
 */
export const SCHEMA_ERRORS = {
  // -------------------------------------------------------------- fields
  'repeater.nested':
    'A repeater cannot sit inside another repeater. Move it out of the outer repeater, or make it a group.',
  'page.nested':
    'A page can only sit at the top level of a form. Move it out of "{key}", or make it a group.',
  'grid.rowNotFlat':
    'A grid\'s rows are flat, and "{key}" holds fields of its own. Give each of those fields a column of its own, or take the grid off this repeater and its rows will be stacked.',
  'grid.columnUnknown':
    'No field of this grid has the key "{field}", so the column would show nothing. Name one of its own fields.',
  'grid.columnTwice': 'Two columns both show "{field}". One answer cannot fill two columns.',
  'bounds.crossed':
    'The earliest allowed value "{earliest}" is after the latest allowed "{latest}", so no answer could be accepted. Swap them, or remove one.',
  'key.taken':
    'Another field already uses the key "{key}". A key identifies one answer, so two fields cannot share one.',
  'key.reserved':
    '"{key}" is reserved: it is how a repeater row carries its identity, so no field can be called that.',
  'rename.self':
    'This field says it was renamed from itself. Drop "renamedFrom", or set it to the key this field used to have.',
  'rename.keyInUse':
    'The key "{key}" is still in use by a field in this form, so this is a copy rather than a rename. Two fields cannot claim the same answers.',
  'rename.claimed':
    'Another field already says it was renamed from "{key}". Old answers can only move to one place.',
  'pattern.invalid': 'This is not a valid regular expression: {reason}.',
  'option.imageInDropdown':
    'A dropdown cannot show a picture, so this image would never be seen. Make the field a radio group, or remove the image.',
  'option.imageInChips':
    'A tag picker shows its options as chips, which cannot show a picture, so this image would never be seen. Take the tag picker off, or remove the image.',
  'option.imageNotDrawn':
    'A ranking and a matrix draw their options with no room for a picture, so this image would never be seen. Pictures are shown on radio buttons and checkboxes; remove this one.',
  'ranking.duplicateOption':
    'Two options of this ranking share the value "{value}". A ranking stores values, so it could not say which of the two was put first — give each option a value of its own.',
  'matrix.duplicateRow':
    'Two rows of this matrix share the value "{value}". A matrix stores each answer under its row, so it could not say which row was answered — give each row a value of its own.',
  'matrix.duplicateColumn':
    'Two columns of this matrix share the value "{value}". A matrix stores the column chosen, so it could not say which of the two was — give each column a value of its own.',
  'mask.noPositions':
    'This mask has nowhere to type, so the field could take no answer. Use 9 for a digit, a for a letter or * for either.',

  // -------------------------------------------------------------- logic
  'rule.skipNoPages':
    'A skip rule walks past a page, and this form has no pages. Give it a "page" field first, or remove the rule.',
  'rule.skipNotAPage':
    '"{target}" is not a page. A skip rule names the key of a page — {pages} — rather than a data path, because a page carries no answer of its own.',
  'rule.unknownTarget':
    'No field has the data path "{target}". A rule can only apply to a field the model defines.',
  'rule.runsOn':
    'Only a validate or check rule can choose where it runs. A {kind} rule that behaved differently in the browser and on the server would leave the server unable to check what the browser did.',
  'rule.duplicate':
    '"{target}" already has a {kind} rule. A field can carry one rule per kind, because two would have no defined winner.',

  // ------------------------------------------------------- translations
  'i18n.noDefaultCatalogue':
    'There is no "{locale}" catalogue, so the language everything falls back to has no words in it.',
  'i18n.noSection': '"{id}" refers to a translation, but this form has no i18n section.',
  'i18n.unknownMessage': 'No message called "{id}" in the "{locale}" catalogue.',

  // ----------------------------------------------------------- layouts
  'layout.nameTaken':
    'Another layout is already called "{name}". A layout is asked for by name, so two cannot share one.',
  'layout.spanOutsideTable':
    '"span" says how many of a table\'s columns to take, and this node is not in a table. Put it in a table node, or remove the span.',
  'layout.spanTooWide':
    'This spans {span} columns in a table that has {columns}. Use "all" for the full width, so it stays right if the column count changes.',
  'layout.codeUnknownPath':
    'No field has the data path "{path}", so this code would encode nothing.',
  'layout.codeNeedsLabel':
    'This code needs a label saying what it is. The picture cannot be read aloud and the value under it is a bare string, so the label is the only thing a screen reader has to go on.',
  'layout.unknownPath': 'No field has the data path "{path}", so this layout places nothing here.',
  'layout.placedTwice':
    '"{path}" is already placed in the "{layout}" layout. A field has one place in an arrangement.',
  'layout.tabNotSection':
    'A tabs node holds sections, one per tab, and this one holds a "{kind}". Wrap it in a section and give the section a label — that label is the tab\'s name.',
  'layout.tabUnnamed':
    'This tab has no name, so nobody can tell what is behind it. Give the section a label.',
  'layout.tabsEmpty': 'A tabs node with no tabs shows nothing at all.',
  'layout.columnsWhole': "A table's column count has to be a whole number.",

  // ----------------------------------------------- spec versions
  'version.widget':
    'A "{widget}" widget needs specVersion "{version}". This document says "{declared}". Change it to "{version}" — everything already in the document keeps working, because a later version only adds.',
  'version.bound':
    'A "{bound}" bound needs specVersion "{version}". This document says "{declared}". Change it to "{version}" — everything already in the document keeps working, because a later version only adds.',
  'version.step':
    'A "step" needs specVersion "{version}". This document says "{declared}". Change it to "{version}" — everything already in the document keeps working, because a later version only adds.',
  'version.mask':
    'A "mask" needs specVersion "{version}". This document says "{declared}". Change it to "{version}" — everything already in the document keeps working, because a later version only adds.',
  'version.optionImage':
    'An option\'s image needs specVersion "{version}". This document says "{declared}". Change it to "{version}" — everything already in the document keeps working, because a later version only adds.',
  'version.optionsSource':
    'An "optionsSource" needs specVersion "{version}". This document says "{declared}". Change it to "{version}" — everything already in the document keeps working, because a later version only adds.',
  'version.fieldType':
    'A "{type}" field needs specVersion "{version}". This document says "{declared}". Change it to "{version}" — everything already in the document keeps working, because a later version only adds.',
  'version.ruleKind':
    'A "{kind}" rule needs specVersion "{version}". This document says "{declared}". Change it to "{version}" — everything already in the document keeps working, because a later version only adds.',
  'version.layoutKind':
    'A "{kind}" layout node needs specVersion "{version}". This document says "{declared}". Change it to "{version}" — everything already in the document keeps working, because a later version only adds.',

  // ------------------------------------- the shape, as the JSON Schema checks it
  'options.twoSources':
    'This field both lists its options and names a source for them, and there is no rule for which wins. Keep the list, or keep the source and remove the list.',
  'shape.notAllowed': 'This is not allowed here.',
  'shape.object': 'Must be an object.',
  'shape.array': 'Must be a list.',
  'shape.string': 'Must be text.',
  'shape.number': 'Must be a number.',
  'shape.integer': 'Must be a whole number.',
  'shape.boolean': 'Must be true or false.',
  'shape.null': 'Must be null.',
  'shape.type': 'Must be {type}.',
  'shape.required': 'Missing required property "{property}".',
  'shape.childFields': 'Only group, page and repeater fields can hold child fields.',
  'shape.unknownProperty': 'Unknown property "{property}". Check the spelling, or remove it.',
  'shape.const': 'Must be {value}.',
  'shape.notOneOf': '{found} is not one of the allowed values: {allowed}.',
  'shape.fieldKey':
    '{found} is not a usable field key. Start with a letter or an underscore, then use only letters, digits and underscores.',
  'shape.formId':
    '{found} is not a usable form ID. Start with a letter or a digit, then use only letters, digits, dots, dashes and underscores.',
  'shape.checkName':
    '{found} is not a usable check name. Name the check and let the deployment say where to ask — an address here would be a deployment detail frozen into a published form, and a way to make a server inside a private network fetch something.',
  'shape.imageSource':
    '{found} is not an image address this form can use. Use an https:// address, a path starting with / on the site that shows the form, or a data:image/ address — not http://, which a secure page blocks.',
  'shape.pattern': '{found} does not match the required pattern {pattern}.',
  'shape.maxLength': 'Must be {limit} characters or fewer.',
  'shape.empty': 'Must not be empty.',
  'shape.minLength': 'Must be at least {limit} characters.',
  // ajv's own wording, for a keyword with no sentence of ours. Terse but accurate,
  // and the one sentence a translation cannot reach, because ajv wrote it.
  'shape.other': '{detail}',
} as const

export type SchemaErrorCode = keyof typeof SCHEMA_ERRORS

/** The values a sentence names, filled into its `{placeholders}`. */
export type SchemaErrorValues = Readonly<Record<string, string | number>>

/** One reason a document is refused: where, which sentence, and that sentence in English. */
export interface SchemaError {
  /** JSON Pointer to the offending value, e.g. `/model/fields/1/key`. */
  path: string
  /** What the form author has to change, in their words rather than the validator's. English. */
  message: string
  /**
   * Which sentence `message` is — stable, so a caller can translate it, or act on
   * it, without matching the English (0122).
   */
  code: SchemaErrorCode
  /** The values `message` names, by the placeholder that names them. */
  values: SchemaErrorValues
}

/** The names a sentence's `{placeholders}` use, read off the sentence's own type. */
type PlaceholdersIn<Sentence extends string> =
  Sentence extends `${string}{${infer Name}}${infer Rest}` ? Name | PlaceholdersIn<Rest> : never

/** Exactly the values a code's sentence names. */
type ValuesFor<Code extends SchemaErrorCode> = {
  readonly [Name in PlaceholdersIn<(typeof SCHEMA_ERRORS)[Code]>]: string | number
}

/**
 * One error, its English sentence rendered from its code and values.
 *
 * Generic over the code so that the compiler holds every call to its sentence: a
 * value the sentence names and the call forgets is a compile error, not a "{key}"
 * shown to an author, and so is a value nothing names. A sentence without
 * placeholders takes no values at all.
 */
export function schemaError<Code extends SchemaErrorCode>(
  path: string,
  code: Code,
  ...[values]: keyof ValuesFor<Code> extends never ? [] : [ValuesFor<Code>]
): SchemaError {
  const given: SchemaErrorValues = values ?? {}
  return { path, code, values: given, message: renderSchemaError(SCHEMA_ERRORS[code], given) }
}

/** A sentence with its placeholders filled, a missing value left visible. */
export function renderSchemaError(template: string, values: SchemaErrorValues): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    values[name] === undefined ? whole : String(values[name]),
  )
}
