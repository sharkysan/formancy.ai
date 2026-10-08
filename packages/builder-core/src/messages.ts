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
  'layout.inList.tabs': 'a tabs',
  'layout.inList.table': 'a table',
  'layout.inList.named.section': 'the “{label}” section',
  'layout.inList.named.row': 'the “{label}” row',
  'layout.inList.named.column': 'the “{label}” column',
  'layout.inList.named.tabs': 'the “{label}” tabs',
  'layout.inList.named.table': 'the “{label}” table',

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

/**
 * German, shipped and complete.
 *
 * Complete because a shipped catalogue with a gap is a builder that is half
 * German, which reads worse than one that is all English. A host translating
 * into a language not shipped here may leave gaps; this one may not, and
 * `messages.test.ts` fails when it does.
 *
 * Written for somebody building a form, in the informal register the rest of
 * the product's German uses: "du", not "Sie", because a tool talking to its user
 * is not a letter from an office.
 */
export const BUILDER_MESSAGES_DE = {
  'tree.empty': 'Dieses Formular hat noch keine Felder.',
  'tree.fieldCount': { one: '{count} Feld', other: '{count} Felder' },
  'palette.title': 'Feld hinzufügen',

  'refuse.cannotOpen': 'Dieses Dokument lässt sich nicht im Builder öffnen: {reasons}',
  'refuse.noContainer': 'Kein Container bei „{path}“.',
  'refuse.noField': 'Kein Feld bei „{path}“.',
  'refuse.moveIntoItself':
    '„{path}“ lässt sich nicht in sich selbst oder eines seiner eigenen Kinder verschieben.',
  'refuse.unwrapRenames':
    'Wenn du „{where}“ auflöst, bekommt jede Antwort darin einen neuen Namen – aus „{from}“ wird „{to}“ –, und {refused}',
  'refuse.renameFollows':
    'Wenn du „{before}“ in „{after}“ umbenennst, muss jede Regel mit diesem Namen folgen, und {refused}',
  'refuse.noRule': 'Keine Regel an Position {index}.',
  'refuse.noLayout': 'Kein Layout namens „{name}“.',
  'refuse.crossLayout':
    'Zwischen den Layouts „{from}“ und „{to}“ lässt sich nicht verschieben. Entferne es aus dem einen und platziere es im anderen.',
  'refuse.downgrade':
    'Dieses Formular ist gegen Spec {from} geschrieben und kann nicht auf {to} zurück: Was die neuere Version hinzugefügt hat, hätte dort keinen Platz – es wäre Datenverlust statt einer Änderung.',
  'refuse.noLayoutNode': 'An dieser Stelle im Layout „{layout}“ ist nichts.',
  'refuse.notAContainerNode':
    'An dieser Stelle im Layout „{layout}“ ist nichts, das andere Knoten aufnehmen kann.',
  'refuse.unwrapLeaf':
    '„{where}“ hält eine einzige Antwort. Darin gibt es nichts zu behalten, und Auflösen ist kein anderes Wort für Löschen.',
  'refuse.unwrapRepeater':
    '„{where}“ ist eine Wiederholung, und die Felder darin beschreiben eine ZEILE, keine Liste von Fragen. Sie herauszulösen würde aus den Antworten jeder Zeile je eine einzige Antwort machen und jede Zeile nach der ersten verlieren – und nichts würde es melden, weil das entstehende Formular vollkommen gültig wäre. Verschieb die Felder einzeln, wenn du das gemeint hast.',

  'proposal.stale':
    'Das Formular hat sich seit diesem Vorschlag geändert; ihn anzuwenden würde diese Änderung verwerfen. Frag noch einmal, um einen Vorschlag für das Formular in seinem jetzigen Zustand zu bekommen.',
  'proposal.empty': 'Dieser Vorschlag ändert nichts am Formular.',
  'refuse.i18nNoneYet':
    'Dieses Formular hat noch keine Übersetzungen. Mach zuerst eine Beschriftung übersetzbar.',
  'refuse.i18nNone': 'Dieses Formular hat keine Übersetzungen.',
  'refuse.fieldNodeHoldsNothing':
    'Ein Feldknoten platziert genau ein Feld. Darin gibt es nichts zu behalten.',
  'refuse.wrapNeedsTwo':
    'Zum Zusammenfassen braucht es mindestens zwei Knoten. Für einen einzelnen nimm insertLayoutNode.',
  'refuse.wrapperNotContainer':
    'Die Hülle muss ein Container sein. Ein Feldknoten kann nichts aufnehmen.',
  'refuse.nodeListedTwice': 'Dieser Knoten ist zweimal aufgeführt. Jeder kann nur einmal hinein.',
  'refuse.wrapContainerWithChild':
    'Ein Container lässt sich nicht zusammen mit etwas aus seinem Inneren zusammenfassen.',
  'refuse.moveNodeIntoItself':
    'Das lässt sich nicht in sich selbst oder eines seiner eigenen Kinder verschieben.',
  'refuse.fieldNodeName': 'Ein Feldknoten trägt den Namen des Feldes, das er platziert.',

  'layout.codeFor': 'Code für {name}',
  'layout.codeFor.inList': 'Code für {name}',
  'layout.named.section': 'Abschnitt „{label}“',
  'layout.named.row': 'Zeile „{label}“',
  'layout.named.column': 'Spalte „{label}“',
  'layout.named.tabs': 'Reiter „{label}“',
  'layout.named.table': 'Tabelle „{label}“',
  'layout.empty.section': 'Leerer Abschnitt',
  'layout.empty.row': 'Leere Zeile',
  'layout.empty.column': 'Leere Spalte',
  'layout.empty.tabs': 'Leere Reiter',
  'layout.empty.table': 'Leere Tabelle',
  'layout.with.section': 'Abschnitt mit {list}',
  'layout.with.row': 'Zeile mit {list}',
  'layout.with.column': 'Spalte mit {list}',
  'layout.with.tabs': 'Reiter mit {list}',
  'layout.with.table': 'Tabelle mit {list}',
  'layout.inList.section': 'ein Abschnitt',
  'layout.inList.row': 'eine Zeile',
  'layout.inList.column': 'eine Spalte',
  'layout.inList.tabs': 'Reiter',
  'layout.inList.table': 'eine Tabelle',
  'layout.inList.named.section': 'der Abschnitt „{label}“',
  'layout.inList.named.row': 'die Zeile „{label}“',
  'layout.inList.named.column': 'die Spalte „{label}“',
  'layout.inList.named.tabs': 'die Reiter „{label}“',
  'layout.inList.named.table': 'die Tabelle „{label}“',

  'target.layout': 'das Layout „{layout}“',
  'target.firstField': '{where}, als erstes Feld',
  'target.firstItem': '{where}, als erstes Element',
  'target.before': '{where}, vor {name}',
  'target.after': '{where}, nach {name}',
  'target.between': '{where}, zwischen {before} und {after}',
  'tree.label': 'Formularstruktur',
  'tree.addWhere': 'Wohin mit „{type}“?',
  'tree.moveTitle': '{name} verschieben',
  'tree.locked': {
    one: '{types} braucht eine neuere Spec-Version. Dieses Formular nennt Version {version}.',
    other: '{types} brauchen eine neuere Spec-Version. Dieses Formular nennt Version {version}.',
  },
  'tree.upgrade': 'Auf Version {version} anheben',
  'dialog.cancel': 'Abbrechen',
  'palette.newPage': 'Seite {number}',

  'keys.arrows.what': 'zwischen Feldern wechseln',
  'keys.add.what': 'Feld hinzufügen',
  'keys.addPage.what': 'Seite hinzufügen; das Formular wird mehrstufig',
  'keys.unwrap.what': 'Container auflösen und den Inhalt behalten',
  'keys.move.what': 'das gewählte Feld verschieben',
  'keys.delete.key': 'Entf',
  'keys.delete.what': 'es entfernen',
  'keys.undo.key': 'Strg+Z / Strg+Y',
  'keys.undo.what': 'rückgängig / wiederherstellen',

  'said.undone': 'Rückgängig gemacht.',
  'said.nothingToUndo': 'Nichts rückgängig zu machen.',
  'said.redone': 'Wiederhergestellt.',
  'said.nothingToRedo': 'Nichts wiederherzustellen.',
  'said.nowhereToMove': '{name} lässt sich nirgendwo anders hin verschieben.',
  'said.pageAdded': '{page} hinzugefügt.',
  'said.firstPageAdded': {
    one: '{page} hinzugefügt; sie enthält das eine Feld, das auf oberster Ebene war. Das Formular ist jetzt mehrstufig.',
    other:
      '{page} hinzugefügt; sie enthält die {count} Felder, die auf oberster Ebene waren. Das Formular ist jetzt mehrstufig.',
  },
  'said.cannotAddPage': 'Die Seite lässt sich nicht hinzufügen: {reason}',
  'said.unwrappedEmpty': '{name} war leer und ist entfernt.',
  'said.unwrappedPage': {
    one: 'Seite {name} entfernt. Ihre eine Frage ist jetzt auf {host}.',
    other: 'Seite {name} entfernt. Ihre {count} Fragen sind jetzt auf {host}.',
  },
  'said.unwrapped': {
    one: '{name} entfernt; die eine Frage darin ist geblieben.',
    other: '{name} entfernt; die {count} Fragen darin sind geblieben.',
  },
  'said.notAWizard': '{said} Das Formular ist nicht mehr mehrstufig.',
  'said.cannotUnwrap': '{name} lässt sich nicht auflösen: {reason}',
  'said.removed': '{name} entfernt.',
  'said.cannotRemove': '{name} lässt sich nicht entfernen: {reason}',
  'said.added': '{what} hinzugefügt: {where}.',
  'said.cannotAdd': 'Lässt sich nicht hinzufügen: {reason}',
  'said.moved': '{name} verschoben: {where}.',
  'said.dropped': '{name} verschoben.',
  'said.cannotMove': 'Lässt sich nicht verschieben: {reason}',
  'said.upgraded':
    'Dieses Formular steht jetzt auf Spec-Version {version}. Sonst hat sich nichts geändert.',
  'said.cannotUpgrade': 'Lässt sich nicht anheben: {reason}',
  'said.alreadyNewest': 'es ist bereits auf der neuesten Version',

  'palette.newField': 'Neues Feld',
  'palette.firstOption': 'Erste Option',

  'rule.visible.label': 'Zeige dieses Feld, wenn',
  'rule.visible.hint':
    'Sonst verborgen, und seine Antwort wird geleert, sofern das Feld es nicht anders festlegt.',
  'rule.required.label': 'Verlange eine Antwort, wenn',
  'rule.required.hint': 'Nur solange die Bedingung gilt.',
  'rule.disabled.label': 'Sperre dieses Feld, wenn',
  'rule.disabled.hint': 'Sichtbar, aber nicht bearbeitbar.',
  'rule.validate.label': 'Lehne die Antwort ab, außer wenn',
  'rule.validate.hint': 'Die Bedingung muss gelten, damit das Formular abgeschickt werden kann.',
  'rule.check.label': 'Frag die Installation nach der Antwort',
  'rule.check.hint':
    'Nennt eine Prüfung, die diese Installation beantwortet – ist diese E-Mail schon registriert, gibt es diese Referenz. Eine Prüfung, die die Installation nicht bereitstellt, lehnt die Antwort ab, statt sie durchzulassen.',
  'rule.computed.label': 'Berechne dieses Feld als',
  'rule.computed.hint':
    'Ein CEL-Ausdruck, der die Antwort liefert und neu berechnet wird, sobald sich ändert, was er liest. Das Feld wird ausgefüllt statt erfragt, also wird ersetzt, was jemand eingetippt hat.',
  'rule.skip.label': 'Überspringe diese Seite, wenn',
  'rule.skip.hint':
    'Die Seite wird in beide Richtungen übergangen, und ihre Fragen werden weder gestellt noch geprüft.',

  'operator.is': 'ist',
  'operator.isNot': 'ist nicht',
  'operator.isMoreThan': 'ist mehr als',
  'operator.isLessThan': 'ist weniger als',
  'operator.isAnswered': 'ist beantwortet',
  'operator.isNotAnswered': 'ist nicht beantwortet',
} as const satisfies Record<BuilderMessageId, Message>

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
