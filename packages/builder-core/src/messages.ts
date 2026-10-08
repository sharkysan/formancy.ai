/**
 * The builder's own words, in one place, in more than one language.
 *
 * Both builders' interfaces were English and written inline, every string of
 * them. A button called one thing in one builder and another in the other is
 * the drift this package exists to prevent
 * ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md)), and
 * nothing would have found it, because nothing compared them. One catalogue,
 * read by both, is what makes the comparison unnecessary
 * ([0114](../../../docs/decisions/0114-the-builder-speaks-the-authors-language.md)).
 *
 * **What this is not**: the form's own text, which is the document's message
 * catalogue and is translated by the translations pane; and the validator's
 * messages, which come from `@formancy/spec` and are not the builder's to word.
 * This is the builder talking to the person building.
 *
 * **Placeholders are `{name}`**, filled from the values a call passes, and left
 * visible when a value is missing — "No field at {path}." is obviously wrong,
 * where "No field at ." reads as a sentence and hides that a value never came.
 *
 * **A count is a plural message**: an object keyed by `Intl.PluralRules`
 * category, so the language chooses the form rather than an `=== 1`. English and
 * German need `one` and `other`; a language that needs `few` or `many` adds them,
 * and `other` is always present because it is the category every language can
 * fall back to.
 */

/** The forms a counted message takes, by `Intl.PluralRules` category. */
export interface PluralMessage {
  readonly zero?: string
  readonly one?: string
  readonly two?: string
  readonly few?: string
  readonly many?: string
  readonly other: string
}

export type Message = string | PluralMessage

/**
 * English, which is the source every other catalogue translates and the fallback
 * for any message one of them leaves out.
 *
 * Ids are grouped by where the words appear, so a translator working down the
 * list meets a pane's words together.
 */
export const BUILDER_MESSAGES = {
  // ---------------------------------------------------------------- the tree
  'tree.empty': 'This form has no fields yet.',
  'tree.fieldCount': { one: '{count} field', other: '{count} fields' },
  'palette.title': 'Add a field',

  // ----------------------------------------------------- what a command refuses
  'refuse.cannotOpen': 'Cannot open this document in a builder session: {reasons}',
  'refuse.noContainer': 'No container at "{path}".',
  'refuse.noField': 'No field at "{path}".',
  'refuse.moveIntoItself': 'Cannot move "{path}" inside itself or one of its own children.',
  'refuse.unwrapRenames':
    'Unwrapping "{where}" renames every answer inside it — "{from}" becomes "{to}" — and {refused}',
  'refuse.renameFollows':
    'Renaming "{before}" to "{after}" means every rule naming it has to follow, and {refused}',
  'refuse.noRule': 'No rule at index {index}.',
  'refuse.noLayout': 'No layout called "{name}".',
  'refuse.crossLayout':
    'Cannot move between the "{from}" and "{to}" layouts. Remove it from one and place it in the other.',
  'refuse.downgrade':
    'This form is written against spec {from} and cannot go back to {to}: whatever the newer version added has nowhere to go, so it would be data loss rather than a change.',
  'refuse.noLayoutNode': 'Nothing at that position in the "{layout}" layout.',
  'refuse.notAContainerNode':
    'Nothing at that position in the "{layout}" layout holds other nodes.',
  'refuse.unwrapLeaf':
    '"{where}" holds one answer. There is nothing inside it to keep, and unwrapping is not another word for deleting.',
  'refuse.unwrapRepeater':
    '"{where}" is a repeater, and the fields inside it describe one ROW rather than a list of questions. Lifting them out would turn every row\'s answers into one answer each and lose every row after the first — and nothing would say so, because the form that came out would be perfectly valid. Move the fields out one at a time if that is what you meant.',

  // ------------------------------------------------- what a proposal refuses
  'proposal.stale':
    'The form changed since this was proposed, so applying it would discard that edit. Ask again to get a proposal against the form as it is now.',
  'proposal.empty': 'That proposal changes nothing about the form.',

  // ------------------------------------ what a translation or layout command refuses
  'refuse.i18nNoneYet': 'This form has no translations yet. Extract a label first.',
  'refuse.i18nNone': 'This form has no translations.',
  'refuse.fieldNodeHoldsNothing':
    'A field node places one field. There is nothing inside it to keep.',
  'refuse.wrapNeedsTwo': 'Wrapping needs at least two nodes. Use insertLayoutNode for one.',
  'refuse.wrapperNotContainer':
    'The wrapper has to be a container. A field node cannot hold anything.',
  'refuse.nodeListedTwice': 'That node is listed twice. Each one can only go in once.',
  'refuse.wrapContainerWithChild': 'Cannot wrap a container together with something inside it.',
  'refuse.moveNodeIntoItself': 'Cannot move this inside itself or one of its own children.',
  'refuse.fieldNodeName': 'A field node takes its name from the field it places.',
  'refuse.notText': '"{property}" on "{path}" is not text, so there is nothing to translate.',
  'refuse.defaultLocale':
    '"{locale}" is the default locale: every other locale falls back to it, so removing it would leave every untranslated message with nothing to resolve to.',
  'refuse.notASetting':
    '"{property}" is not a setting. It is what the node is, or where it sits, and the arrangement\'s own commands change it.',
  'refuse.settingName': '"{property}" is not allowed as a layout node setting name.',
  'translations.unreadable': 'That file could not be read: it is not JSON.',
  'refuse.notACatalogue':
    'That is not a translation file from a formancy builder: it has no locale and no list of messages.',
  // Set into refuse.renameFollows and refuse.unwrapRenames after "and", so it
  // starts in lower case. {reason} is the expression parser's own message.
  'refuse.ruleCannotFollow':
    'rule {number} (“{kind}” on “{target}”) cannot follow the change: {reason} Change or delete the rule first.',

  // --------------------------------------------- naming a node in the layout tree
  // Whole sentences per kind rather than a kind slotted into a template: the
  // adjective and the article agree with the noun in most languages, and
  // "Leer {kind}" has no correct German.
  'layout.codeFor': 'Code for {name}',
  'layout.codeFor.inList': 'code for {name}',
  'layout.named.section': 'Section “{label}”',
  'layout.named.row': 'Row “{label}”',
  'layout.named.column': 'Column “{label}”',
  'layout.named.tabs': 'Tabs “{label}”',
  'layout.named.table': 'Table “{label}”',
  'layout.empty.section': 'Empty section',
  'layout.empty.row': 'Empty row',
  'layout.empty.column': 'Empty column',
  'layout.empty.tabs': 'Empty tabs',
  'layout.empty.table': 'Empty table',
  'layout.with.section': 'Section with {list}',
  'layout.with.row': 'Row with {list}',
  'layout.with.column': 'Column with {list}',
  'layout.with.tabs': 'Tabs with {list}',
  'layout.with.table': 'Table with {list}',
  'layout.inList.section': 'a section',
  'layout.inList.row': 'a row',
  'layout.inList.column': 'a column',
  'layout.inList.tabs': 'a set of tabs',
  'layout.inList.table': 'a table',
  'layout.inList.named.section': 'the “{label}” section',
  'layout.inList.named.row': 'the “{label}” row',
  'layout.inList.named.column': 'the “{label}” column',
  'layout.inList.named.tabs': 'the “{label}” tabs',
  'layout.inList.named.table': 'the “{label}” table',
  // A node about to be added, on its own in a sentence: "Where should a row go?".
  // Separate from the list forms above because in German they take different
  // cases — a list after "mit" is dative, a subject is nominative — and one form
  // for both shipped "Abschnitt mit eine Zeile".
  'layout.new.section': 'a section',
  'layout.new.row': 'a row',
  'layout.new.column': 'a column',
  'layout.new.tabs': 'a set of tabs',
  'layout.new.table': 'a table',
  'layout.new.qrcode': 'the code for {name}',

  // ------------------------------------------- where a move or an insertion lands
  // Read out by a screen reader while somebody moves a field without a mouse, so
  // each one has to be enough on its own. {where} is a container's name.
  'target.layout': 'the {layout} layout',
  'target.firstField': '{where}, as its first field',
  'target.firstItem': '{where}, as its first item',
  'target.before': '{where}, before {name}',
  'target.after': '{where}, after {name}',
  'target.between': '{where}, between {before} and {after}',
  // ------------------------------------------------------------ the structure tree
  'tree.label': 'Form structure',
  'tree.addWhere': 'Where should the {type} go?',
  'tree.moveTitle': 'Move {name}',
  'tree.locked': {
    one: '{types} needs a later spec version. This form says version {version}.',
    other: '{types} need a later spec version. This form says version {version}.',
  },
  'tree.upgrade': 'Move it to version {version}',
  'dialog.cancel': 'Cancel',
  'palette.newPage': 'Page {number}',

  // The legend under the tree. The letters are bindings and are not translated;
  // the names of other keys are, because a German keyboard says Entf and Strg.
  'keys.arrows.what': 'move between fields',
  'keys.add.what': 'add a field',
  'keys.addPage.what': 'add a page, making the form a wizard',
  'keys.unwrap.what': 'take a container away and keep what is inside',
  'keys.move.what': 'move the focused field',
  'keys.delete.key': 'Delete',
  'keys.delete.what': 'remove it',
  'keys.undo.key': 'Ctrl+Z / Ctrl+Y',
  'keys.undo.what': 'undo / redo',

  // ------------------------------------- what a builder says after a command
  // Announced in one polite live region, so each has to make sense heard alone.
  'said.undone': 'Undone.',
  'said.nothingToUndo': 'Nothing to undo.',
  'said.redone': 'Redone.',
  'said.nothingToRedo': 'Nothing to redo.',
  'said.nowhereToMove': '{name} cannot be moved anywhere else.',
  'said.pageAdded': 'Added {page}.',
  'said.firstPageAdded': {
    one: 'Added {page}, holding the {count} field that was at the top level. The form is a wizard now.',
    other:
      'Added {page}, holding the {count} fields that were at the top level. The form is a wizard now.',
  },
  'said.cannotAddPage': 'Cannot add a page: {reason}',
  'said.unwrappedEmpty': 'Removed {name}, which was empty.',
  'said.unwrappedPage': {
    one: 'Removed the page {name}. Its {count} question is on {host} now.',
    other: 'Removed the page {name}. Its {count} questions are on {host} now.',
  },
  'said.unwrapped': {
    one: 'Removed {name} and kept the {count} question that was inside it.',
    other: 'Removed {name} and kept the {count} questions that were inside it.',
  },
  'said.notAWizard': '{said} The form is not a wizard any more.',
  'said.cannotUnwrap': 'Cannot unwrap {name}: {reason}',
  'said.removed': 'Removed {name}.',
  'said.cannotRemove': 'Cannot remove {name}: {reason}',
  'said.added': 'Added {what} to {where}.',
  'said.cannotAdd': 'Cannot add: {reason}',
  'said.moved': 'Moved {name} to {where}.',
  'said.dropped': 'Moved {name}.',
  'said.cannotMove': 'Cannot move: {reason}',
  'said.upgraded': 'Moved this form to spec version {version}. Nothing else changed.',
  'said.cannotUpgrade': 'Cannot upgrade: {reason}',
  'said.alreadyNewest': 'already at the newest version',
  // ---------------------------------------------------------- the arrangement pane
  'layout.label': 'Arrangement',
  'layout.treeName': '{label}: {name}',
  'layout.none':
    'This form has no arrangement. Without one the renderers show every field in the order the model lists them, one per line — which is a perfectly good form. Add an arrangement to put fields side by side.',
  'layout.addLayout': 'Add an arrangement',
  'layout.placesNothing':
    "This arrangement places nothing yet, so the form falls back to the model's own order.",
  'layout.unplaced': 'Not in this arrangement',
  'layout.addTitle': 'Add to the arrangement',
  'layout.addWhere': 'Where should {what} go?',
  'layout.codeWhich': 'Which answer should the code hold?',
  'layout.kind.row': 'Row',
  'layout.kind.column': 'Column',
  'layout.kind.section': 'Section',
  'layout.kind.qrcode': 'Code',
  'layout.hint.row':
    'Puts what is inside it side by side, and back into one column when there is no width for two.',
  'layout.hint.column': 'One side of a row.',
  'layout.hint.section': 'A named group of items, announced as one.',
  'layout.hint.qrcode':
    'A scannable code drawn from an answer. Collects nothing itself, and shows the answer as text beside it.',
  'layout.codeLocked':
    'A scannable code needs spec version {version}. This form says version {current}.',
  'layout.hint.unplaced': 'Not placed anywhere yet.',
  // Written into the document as the code's label, so it is in the author's language.
  'layout.newCode': '{name} as a code',
  'layout.wrapTitle': 'What should go beside {name} in a row?',
  'layout.wrapHelp':
    'Choose the item to put beside {name}. Both go into a new row, with {name} first.',
  'keys.layout.arrows.what': 'move between items',
  'keys.layout.add.what': 'add a row, column, section, code or field',
  'keys.layout.move.what': 'move the focused item',
  'keys.layout.unwrap.what': 'unwrap a row or column, keeping what is in it',
  'keys.layout.wrap.what': 'wrap it and another item into a row, side by side',
  'keys.layout.delete.what': 'take it out of the arrangement',
  'said.layoutAdded': 'Added a {name} arrangement.',
  'said.layoutUnwrapped': 'Unwrapped {name}. What was inside it stayed where it was.',
  'said.layoutRemoved': 'Took {name} out of the arrangement. The form still collects it.',
  'said.wrapped': 'Put {first} and {second} side by side in a row.',
  'said.cannotWrap': 'Cannot wrap: {reason}',
  'said.nothingBeside': 'There is nothing to put beside {name}.',
  // ------------------------------------------------------------- the property editors
  'options.heading': 'Choices',
  'options.empty': 'No choices yet. A dropdown with none cannot be answered.',
  // "Choice label", not "Label": the panel already has a Label for the field itself,
  // and two controls with one name are ambiguous read aloud.
  'options.label': 'Choice label',
  'options.value': 'Stored value',
  'options.remove': 'Remove {name}',
  'options.add': 'Add a choice',
  // Written into the document, so it is in the author's language.
  'options.newChoice': 'New choice',
  'list.remove': 'Remove',
  'columns.heading': 'Columns',
  'columns.empty':
    'No columns configured. Every answer still gets one, in the order the fields are declared.',
  'columns.answer': 'Answer',
  'columns.noSuchField': '{name} — no such field',
  'columns.width': 'Width, as a share',
  'columns.align': 'Align',
  'columns.align.default': 'Default',
  'columns.align.start': 'Start',
  'columns.align.center': 'Center',
  'columns.align.end': 'End',
  'columns.header': 'Short heading',
  'columns.remove': 'Remove the {name} column',
  'columns.allNamed':
    'Every answer has a column. The ones above are sized and ordered; removing one puts its answer back at the end rather than taking it off the form.',
  'columns.configure': 'Configure the {name} column',
  'layoutProps.heading.field': 'This placement',
  'layoutProps.heading.qrcode': 'This code',
  'layoutProps.heading.section': 'This section',
  'layoutProps.heading.row': 'This row',
  'layoutProps.heading.column': 'This column',
  'layoutProps.heading.tabs': 'This tab strip',
  'layoutProps.heading.table': 'This grid',
  // ------------------------------------------------------------------ the logic panel
  'logic.heading': 'Rules',
  'logic.empty': 'This field always behaves the same way.',
  'logic.remove': 'Remove the rule “{rule}” on {target}',
  'logic.add': 'Add a rule',
  'logic.what': 'What the rule does',
  'logic.check': 'Which check',
  // Examples in the box, not values: a check's name and a calculation in CEL.
  'logic.check.example': 'email-not-taken',
  'logic.calculation': 'The calculation',
  'logic.calculation.example': 'qty * unitPrice',
  'logic.match': 'Match',
  'logic.join.all': 'all of these',
  'logic.join.any': 'any of these',
  'logic.field': 'Field',
  'logic.field.numbered': 'Field {number}',
  'logic.comparison': 'Comparison',
  'logic.comparison.numbered': 'Comparison {number}',
  'logic.value': 'Value',
  'logic.value.numbered': 'Value {number}',
  'logic.removeComparison': 'Remove comparison {number}',
  'logic.addComparison': 'Add a comparison',
  'logic.addRule': 'Add rule',

  // ----------------------------------------- what a new field starts out holding
  // Written into the document, so they are in the author's language: somebody
  // building a German form should not have to retype "New field" in every one.
  'palette.newField': 'New field',
  'palette.firstOption': 'First option',

  // ---------------------------------------------------------------- rule kinds
  'rule.visible.label': 'Show this field when',
  'rule.visible.hint': 'Hidden otherwise, and its answer is cleared unless the field says not to.',
  'rule.required.label': 'Require an answer when',
  'rule.required.hint': 'Only while the condition holds.',
  'rule.disabled.label': 'Disable this field when',
  'rule.disabled.hint': 'Visible but not editable.',
  'rule.validate.label': 'Reject the answer unless',
  'rule.validate.hint': 'The condition must hold for the form to be submitted.',
  'rule.check.label': 'Ask the deployment about the answer',
  'rule.check.hint':
    'Names a check this deployment answers — is this email already registered, does this reference exist. A check the deployment has not supplied refuses the answer rather than passing it.',
  'rule.computed.label': 'Calculate this field as',
  'rule.computed.hint':
    'A CEL expression producing the answer, recomputed whenever what it reads changes. The field is filled in rather than asked, so what somebody typed is replaced.',
  'rule.skip.label': 'Skip this page when',
  'rule.skip.hint':
    'The page is walked past, in both directions, and the questions on it are neither asked nor validated.',

  // ----------------------------------------------------------------- operators
  'operator.is': 'is',
  'operator.isNot': 'is not',
  'operator.isMoreThan': 'is more than',
  'operator.isLessThan': 'is less than',
  'operator.isAnswered': 'is answered',
  'operator.isNotAnswered': 'is not answered',
} as const satisfies Record<string, Message>

export type BuilderMessageId = keyof typeof BUILDER_MESSAGES

/** A translation: any subset of the ids, each the same kind of message as its English. */
export type BuilderCatalogue = { readonly [Id in BuilderMessageId]?: Message }

/** A message, in the language a builder was given, with its placeholders filled. */
export interface BuilderText {
  (id: BuilderMessageId, values?: Readonly<Record<string, string | number>>): string
  /**
   * Items joined the way this language joins them: "A, B and C", "A, B und C".
   *
   * `Intl.ListFormat` rather than `join(', ')` plus a final "and", which is
   * English grammar spelled in code — and the word "and" itself was the one
   * string the old joiner could not let anybody translate.
   */
  list(items: readonly string[]): string
  /**
   * BCP 47: the locale every word is joined and counted in. The one asked for,
   * or English when the runtime has no data for it — so a caller formatting
   * anything else to match gets the same answer this did.
   */
  readonly locale: string
}

export interface BuilderLanguage {
  /**
   * BCP 47. Decides how a count and a list are worded; it does not choose the
   * catalogue. One the runtime has no data for is treated as English.
   */
  readonly locale: string
  readonly messages: BuilderCatalogue
}

const ENGLISH = 'en-GB'

/**
 * The function both builders call for every word they show.
 *
 * Built once per language rather than looked up per call, so the plural rules
 * are constructed once. A message missing from the catalogue falls back to
 * English one message at a time: a host translating incrementally gets a
 * usable builder at every step, never an id and never an empty button.
 */
export function createBuilderText(language?: BuilderLanguage): BuilderText {
  /*
   * `en-GB` rather than `en` by default, because that is the English this
   * repository writes — and it decides the list format: `en` joins three
   * items with an Oxford comma, which would have changed every "Row with A,
   * B and C" the layout tree has ever shown.
   */
  const locale = runtimeHas(language?.locale) ? language.locale : ENGLISH
  const messages = language?.messages ?? {}
  const plurals = new Intl.PluralRules(locale)
  const lists = new Intl.ListFormat(locale, {
    style: 'long',
    type: 'conjunction',
  })

  const text = (id: BuilderMessageId, values: Readonly<Record<string, string | number>> = {}) => {
    const message: Message = messages[id] ?? BUILDER_MESSAGES[id]
    const template =
      typeof message === 'string' ? message : pluralForm(message, plurals, values['count'])

    return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
      const value = values[name]
      // Left visible rather than emptied: see the module docblock.
      return value === undefined ? whole : String(value)
    })
  }

  return Object.assign(text, {
    list: (items: readonly string[]) => lists.format(items),
    locale,
  })
}

/**
 * Whether `Intl` has data for this locale, rather than quietly substituting its own.
 *
 * ECMA-402 resolves a locale it has no data for to the runtime's default, and the
 * default is the machine's: measured, `xx` became `gsw-CH` on a machine set to
 * Swiss German, and the same document's layout tree joined "A und B" there and
 * "A and B" in CI. English instead, because English is what every message a
 * catalogue lacks falls back to — a sentence in one language should not be joined
 * in a third chosen by the operating system.
 *
 * A tag that is not BCP 47 at all still throws a `RangeError` here, at
 * construction: that is a host's mistake, and loud once beats wrong everywhere.
 */
function runtimeHas(locale: string | undefined): locale is string {
  // One formatter asked, not both: they read the same locale data, and a second
  // check that never disagrees with the first is a line no test can tell is there.
  return locale !== undefined && Intl.ListFormat.supportedLocalesOf([locale]).length > 0
}

function pluralForm(
  message: PluralMessage,
  rules: Intl.PluralRules,
  count: string | number | undefined,
): string {
  // A plural message called without a count says so rather than guessing a
  // number: the `other` form with `{count}` left visible.
  if (typeof count !== 'number') return message.other
  return message[rules.select(count)] ?? message.other
}
