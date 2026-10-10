import type { BuilderMessageId, Message } from './messages.js'
import { DRAFT_MESSAGES_DE } from './messages-drafts-de.js'

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
 *
 * Its own file because a translation changes for a different reason from the
 * English it translates — and a translator works down one file, not past the
 * plural machinery to find where the German starts.
 */
export const BUILDER_MESSAGES_DE = {
  // Drafting examples, in a file of its own (0162).
  ...DRAFT_MESSAGES_DE,
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
  'refuse.notText': '„{property}“ an „{path}“ ist kein Text, es gibt also nichts zu übersetzen.',
  'refuse.defaultLocale':
    '„{locale}“ ist die Standardsprache: Jede andere Sprache fällt auf sie zurück, und ohne sie hätte jede unübersetzte Meldung nichts, worauf sie zurückfallen kann.',
  'refuse.notASetting':
    '„{property}“ ist keine Einstellung. Es ist, was der Knoten ist oder wo er steht, und das ändern die Befehle der Anordnung selbst.',
  'refuse.settingName': '„{property}“ ist als Name einer Einstellung eines Layout-Knotens nicht erlaubt.',
  'translations.unreadable': 'Diese Datei ließ sich nicht lesen: Sie ist kein JSON.',
  'refuse.notACatalogue':
    'Das ist keine Übersetzungsdatei eines formancy-Builders: Sie hat keine Sprache und keine Liste von Meldungen.',
  'refuse.ruleCannotFollow':
    'Regel {number} („{kind}“ für „{target}“) kann der Änderung nicht folgen: {reason} Ändere oder lösche die Regel zuerst.',
  'refuse.fieldNodeName': 'Ein Feldknoten trägt den Namen des Feldes, das er platziert.',

  'layout.codeFor': 'Code für {name}',
  'layout.codeFor.inList': 'dem Code für {name}',
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
  'layout.inList.section': 'einem Abschnitt',
  'layout.inList.row': 'einer Zeile',
  'layout.inList.column': 'einer Spalte',
  'layout.inList.tabs': 'Reitern',
  'layout.inList.table': 'einer Tabelle',
  'layout.inList.named.section': 'dem Abschnitt „{label}“',
  'layout.inList.named.row': 'der Zeile „{label}“',
  'layout.inList.named.column': 'der Spalte „{label}“',
  'layout.inList.named.tabs': 'den Reitern „{label}“',
  'layout.inList.named.table': 'der Tabelle „{label}“',
  'layout.new.section': 'ein Abschnitt',
  'layout.new.row': 'eine Zeile',
  'layout.new.column': 'eine Spalte',
  'layout.new.tabs': 'Reiter',
  'layout.new.table': 'eine Tabelle',
  'layout.new.qrcode': 'der Code für {name}',

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
  'said.added': 'Hinzugefügt: {what} – {where}.',
  'said.cannotAdd': 'Lässt sich nicht hinzufügen: {reason}',
  'keys.block.what': 'das Feld unter dem Fokus als Block speichern',
  'blocks.heading': 'Deine Blöcke',
  'blocks.none':
    'Noch keine Blöcke. Speichere ein Feld oder eine Gruppe als Block, um sie wieder zu verwenden.',
  'blocks.save': 'Als Block speichern',
  'blocks.name': 'Name des Blocks',
  'blocks.saveConfirm': 'Block speichern',
  'blocks.addWhere': 'Wohin mit dem Block „{name}“?',
  'said.blockSaved': {
    one: '„{name}“ als Block gespeichert, ohne die {count} Regel, die Felder außerhalb liest.',
    other: '„{name}“ als Block gespeichert, ohne die {count} Regeln, die Felder außerhalb lesen.',
  },
  'said.blockSavedWhole': '„{name}“ als Block gespeichert.',
  'said.blockAdded': 'Block „{name}“ hinzugefügt – {where}.',
  'refuse.blockIsPage':
    'Eine Seite ist kein Block: Speichere ein Feld oder eine Gruppe oder Wiederholung von Feldern.',
  'refuse.blockInRow':
    'Ein Feld in einer Zeile einer Wiederholung lässt sich nicht als Block speichern: Seine Regeln gelten für jede Zeile.',
  'refuse.blockRulesInRow':
    'Ein Block mit Regeln kann nicht in die Zeile einer Wiederholung: Seine Regeln würden für jede Zeile gelten.',
  'said.moved': '{name} verschoben: {where}.',
  'said.dropped': '{name} verschoben.',
  'said.cannotMove': 'Lässt sich nicht verschieben: {reason}',
  'said.upgraded':
    'Dieses Formular steht jetzt auf Spec-Version {version}. Sonst hat sich nichts geändert.',
  'said.cannotUpgrade': 'Lässt sich nicht anheben: {reason}',
  'said.alreadyNewest': 'es ist bereits auf der neuesten Version',
  'layout.label': 'Anordnung',
  'layout.treeName': '{label}: {name}',
  'layout.none':
    'Dieses Formular hat keine Anordnung. Ohne eine zeigen die Renderer jedes Feld in der Reihenfolge des Modells, eines pro Zeile – was ein völlig gutes Formular ist. Füge eine Anordnung hinzu, um Felder nebeneinanderzustellen.',
  'layout.addLayout': 'Anordnung hinzufügen',
  'layout.placesNothing':
    'Diese Anordnung platziert noch nichts, also folgt das Formular der Reihenfolge des Modells.',
  'layout.unplaced': 'Nicht in dieser Anordnung',
  'layout.addTitle': 'Zur Anordnung hinzufügen',
  'layout.addWhere': 'Wohin soll {what} kommen?',
  'layout.codeWhich': 'Welche Antwort soll der Code enthalten?',
  'layout.kind.row': 'Zeile',
  'layout.kind.column': 'Spalte',
  'layout.kind.section': 'Abschnitt',
  'layout.kind.qrcode': 'Code',
  'layout.hint.row':
    'Stellt seinen Inhalt nebeneinander – und wieder untereinander, wenn für zwei kein Platz ist.',
  'layout.hint.column': 'Eine Seite einer Zeile.',
  'layout.hint.section': 'Eine benannte Gruppe von Elementen, als eine angesagt.',
  'layout.hint.qrcode':
    'Ein scanbarer Code aus einer Antwort. Erfasst selbst nichts und zeigt die Antwort als Text daneben.',
  'layout.codeLocked':
    'Ein scanbarer Code braucht Spec-Version {version}. Dieses Formular nennt Version {current}.',
  'layout.hint.unplaced': 'Noch nirgends platziert.',
  'layout.newCode': '{name} als Code',
  'layout.wrapTitle': 'Was soll in einer Zeile neben {name} stehen?',
  'layout.wrapHelp':
    'Wähle das Element, das neben {name} kommt. Beide kommen in eine neue Zeile, {name} zuerst.',
  'keys.layout.arrows.what': 'zwischen Elementen wechseln',
  'keys.layout.add.what': 'Zeile, Spalte, Abschnitt, Code oder Feld hinzufügen',
  'keys.layout.move.what': 'das gewählte Element verschieben',
  'keys.layout.unwrap.what': 'Zeile oder Spalte auflösen, den Inhalt behalten',
  'keys.layout.wrap.what': 'es mit einem anderen Element nebeneinander in eine Zeile stellen',
  'keys.layout.delete.what': 'aus der Anordnung nehmen',
  'said.layoutAdded': 'Anordnung „{name}“ hinzugefügt.',
  'said.layoutUnwrapped': '{name} aufgelöst. Der Inhalt ist geblieben, wo er war.',
  'said.layoutRemoved': '{name} aus der Anordnung genommen. Das Formular erfasst es weiterhin.',
  'said.wrapped': '{first} und {second} stehen jetzt nebeneinander in einer Zeile.',
  'said.cannotWrap': 'Lässt sich nicht zusammenfassen: {reason}',
  'said.nothingBeside': 'Neben {name} lässt sich nichts stellen.',
  'options.heading': 'Auswahlmöglichkeiten',
  'options.empty':
    'Noch keine Auswahlmöglichkeiten. Eine Auswahlliste ohne sie lässt sich nicht beantworten.',
  'options.label': 'Beschriftung der Auswahl',
  'options.value': 'Gespeicherter Wert',
  'options.remove': '{name} entfernen',
  'options.add': 'Auswahl hinzufügen',
  'options.newChoice': 'Neue Auswahl',
  'rows.heading': 'Zeilen',
  'rows.empty': 'Noch keine Zeilen. Eine Matrix ohne Zeilen fragt nichts.',
  'rows.label': 'Zeilenbeschriftung',
  'rows.add': 'Zeile hinzufügen',
  'rows.newRow': 'Neue Zeile',
  'options.image': 'Bildadresse',
  'options.imageAlt': 'Was das Bild zeigt',
  'list.remove': 'Entfernen',
  'columns.heading': 'Spalten',
  'columns.empty':
    'Keine Spalten eingerichtet. Jede Antwort bekommt trotzdem eine, in der Reihenfolge der Felder.',
  'columns.answer': 'Antwort',
  'columns.noSuchField': '{name} – kein solches Feld',
  'columns.width': 'Breite, als Anteil',
  'columns.align': 'Ausrichtung',
  'columns.align.default': 'Standard',
  'columns.align.start': 'Anfang',
  'columns.align.center': 'Mitte',
  'columns.align.end': 'Ende',
  'columns.header': 'Kurze Überschrift',
  'columns.remove': 'Spalte {name} entfernen',
  'columns.allNamed':
    'Jede Antwort hat eine Spalte. Die obigen sind bemessen und geordnet; eine zu entfernen setzt ihre Antwort ans Ende, statt sie aus dem Formular zu nehmen.',
  'columns.configure': 'Spalte {name} einrichten',
  'layoutProps.heading.field': 'Diese Platzierung',
  'layoutProps.heading.qrcode': 'Dieser Code',
  'layoutProps.heading.section': 'Dieser Abschnitt',
  'layoutProps.heading.row': 'Diese Zeile',
  'layoutProps.heading.column': 'Diese Spalte',
  'layoutProps.heading.tabs': 'Diese Reiterleiste',
  'layoutProps.heading.table': 'Dieses Raster',
  'logic.heading': 'Regeln',
  'logic.empty': 'Dieses Feld verhält sich immer gleich.',
  'logic.remove': 'Regel „{rule}“ für {target} entfernen',
  'logic.add': 'Regel hinzufügen',
  'logic.what': 'Was die Regel tut',
  'logic.check': 'Welche Prüfung',
  'logic.check.example': 'email-bereits-vergeben',
  'logic.calculation': 'Die Berechnung',
  'logic.calculation.example': 'menge * stueckpreis',
  'logic.match': 'Zutreffen müssen',
  'logic.join.all': 'alle davon',
  'logic.join.any': 'mindestens eine davon',
  'logic.field': 'Feld',
  'logic.field.numbered': 'Feld {number}',
  'logic.comparison': 'Vergleich',
  'logic.comparison.numbered': 'Vergleich {number}',
  'logic.value': 'Wert',
  'logic.value.numbered': 'Wert {number}',
  'logic.removeComparison': 'Vergleich {number} entfernen',
  'logic.addComparison': 'Vergleich hinzufügen',
  'logic.addGroup': 'Gruppe hinzufügen',
  'logic.group': 'Gruppe {number}',
  'logic.group.match': 'In Gruppe {number} zutreffen müssen',
  'logic.group.add': 'Vergleich zu Gruppe {number} hinzufügen',
  'logic.group.remove': 'Gruppe {number} entfernen',
  'logic.value.yes': 'Ja',
  'logic.value.no': 'Nein',
  'logic.value.choose': 'Wert wählen',
  'logic.field.inRow': '{field} in dieser Zeile',
  'overview.heading': 'Alle Regeln dieses Formulars',
  'overview.empty': 'Dieses Formular hat keine Regeln: Jedes Feld verhält sich immer gleich.',
  'overview.written': 'Geschrieben als',
  'overview.comparison': '{field} {operator} {value}',
  'overview.comparison.noValue': '{field} {operator}',
  'overview.notAnswered': 'nicht beantwortet',
  'overview.because.holds': '{comparison}: ja',
  'overview.because.fails': '{comparison}: nein – es ist {actual}',
  'overview.because.failsEmpty': '{comparison}: nein – es ist nicht beantwortet',
  'overview.now.visible.holds': 'Jetzt sichtbar.',
  'overview.now.visible.fails': 'Jetzt verborgen.',
  'overview.now.visible.undecided':
    'Jetzt sichtbar, weil die Regel sich nicht entscheiden lässt: Eine Regel, die scheitert, zeigt das Feld, das sie verbergen sollte.',
  'overview.now.required.holds': 'Jetzt Pflicht.',
  'overview.now.required.fails': 'Jetzt keine Pflicht.',
  'overview.now.required.undecided':
    'Jetzt keine Pflicht, weil die Regel sich nicht entscheiden lässt.',
  'overview.now.disabled.holds': 'Jetzt gesperrt.',
  'overview.now.disabled.fails': 'Jetzt bearbeitbar.',
  'overview.now.disabled.undecided':
    'Jetzt bearbeitbar, weil die Regel sich nicht entscheiden lässt.',
  'overview.now.validate.holds': 'Jetzt angenommen.',
  'overview.now.validate.fails': 'Jetzt abgelehnt.',
  'overview.now.validate.undecided':
    'Jetzt abgelehnt, weil die Regel sich nicht entscheiden lässt: Eine Prüfung, die scheitert, lehnt die Antwort ab.',
  'overview.now.skip.holds': 'Wird jetzt übersprungen.',
  'overview.now.skip.fails': 'Wird jetzt nicht übersprungen.',
  'overview.now.skip.undecided':
    'Wird jetzt nicht übersprungen, weil die Regel sich nicht entscheiden lässt.',
  'overview.row': 'Zeile {number}',
  'overview.rows.none': 'Die Vorschau hat noch keine Zeilen, also gibt es nichts zu entscheiden.',
  // Not "Regel hinzufügen" again: in German the draft's submit and the button that
  // opens the draft would otherwise share a name.
  'logic.addRule': 'Regel anlegen',
  'said.movedTo': 'Verschoben: {where}.',

  'translations.orphaned':
    'Diese Meldungen verwendet das Formular nicht mehr. Sie bleiben, statt entfernt zu werden – ein Feld kann zurückkommen, und ein Jahr Übersetzungsarbeit soll nicht verschwinden, weil sich ein Schlüssel geändert hat.',
  'translations.none':
    'In diesem Formular ist noch nichts übersetzbar: Seine Wörter stehen im Dokument, statt darauf zu verweisen. Sie herauszulösen behält, was sie sagen, und erlaubt, eine Sprache daneben zu stellen.',
  'translations.extract': 'Dieses Formular übersetzbar machen',
  'translations.language': 'Sprache',
  'translations.default': '{locale} (Standard)',
  'translations.new': 'Neue Sprache',
  'translations.new.example': 'fr',
  'translations.add': 'Sprache hinzufügen',
  'translations.download': '{locale} herunterladen',
  'translations.upload': 'Übersetzte Datei hochladen',
  'translations.written': {
    one: '{count} Übersetzung geschrieben.',
    other: '{count} Übersetzungen geschrieben.',
  },
  'translations.unknown':
    'Nicht geschrieben, weil dieses Formular sie nicht mehr hat – die Datei wurde exportiert, bevor ein Feld entfernt wurde: {list}',
  'translations.stale':
    'Geschrieben, aber aus einem Wortlaut übersetzt, der sich inzwischen geändert hat – einen Blick wert: {list}',
  'translations.missing': 'Nicht übersetzt',
  'translations.preview': 'Vorschau auf {locale}',
  'translations.previewSubmit': 'Absenden',

  'prompt.label': 'Beschreib das Formular oder die Änderung, die du willst',
  'prompt.example':
    'Ein Kontaktformular mit E-Mail-Adresse und Nachricht, und einer Telefonnummer nur, wenn jemand um Rückruf bittet',
  'prompt.write': 'Schreiben',
  'prompt.writing': 'Wird geschrieben …',
  'prompt.stop': 'Anhalten',
  'prompt.review': 'Diese Änderungen prüfen',
  'prompt.review.costs': 'Diese Änderungen prüfen – einige betreffen bereits erfasste Antworten',
  'prompt.review.stops': {
    one: 'Diese Änderungen prüfen – {count} Szenario würde nicht mehr gelten: {list}',
    other: 'Diese Änderungen prüfen – {count} Szenarien würden nicht mehr gelten: {list}',
  },
  'prompt.review.costsStops': {
    one: 'Diese Änderungen prüfen – einige betreffen bereits erfasste Antworten, und {count} Szenario würde nicht mehr gelten: {list}',
    other:
      'Diese Änderungen prüfen – einige betreffen bereits erfasste Antworten, und {count} Szenarien würden nicht mehr gelten: {list}',
  },
  'prompt.asked': 'Als Antwort auf „{instruction}“',
  'prompt.apply': 'Diese Änderungen übernehmen',
  'prompt.discard': 'Verwerfen',
  'prompt.lastAnswer': 'Was das Modell zuletzt geantwortet hat',
  'prompt.status.writing': 'Das Formular wird geschrieben und geprüft.',
  'prompt.status.refused': 'Nicht übernommen. {reason}',
  'prompt.status.ready': {
    one: 'Bereit zur Prüfung: {count} Änderung, die keine bereits erfassten Antworten betrifft. Nichts wurde übernommen.',
    other:
      'Bereit zur Prüfung: {count} Änderungen, von denen keine bereits erfasste Antworten betrifft. Nichts wurde übernommen.',
  },
  'prompt.status.readyCosts': {
    one: 'Bereit zur Prüfung: {count} Änderung, und sie betrifft bereits erfasste Antworten. Nichts wurde übernommen.',
    other:
      'Bereit zur Prüfung: {count} Änderungen, und einige davon betreffen bereits erfasste Antworten. Nichts wurde übernommen.',
  },
  'prompt.status.readyAfter': {
    one: 'Bereit zur Prüfung nach {attempts} Versuchen: {count} Änderung, die keine bereits erfassten Antworten betrifft. Nichts wurde übernommen.',
    other:
      'Bereit zur Prüfung nach {attempts} Versuchen: {count} Änderungen, von denen keine bereits erfasste Antworten betrifft. Nichts wurde übernommen.',
  },
  'prompt.status.readyAfterCosts': {
    one: 'Bereit zur Prüfung nach {attempts} Versuchen: {count} Änderung, und sie betrifft bereits erfasste Antworten. Nichts wurde übernommen.',
    other:
      'Bereit zur Prüfung nach {attempts} Versuchen: {count} Änderungen, und einige davon betreffen bereits erfasste Antworten. Nichts wurde übernommen.',
  },
  'prompt.status.wouldStop': 'Würde bei Übernahme nicht mehr gelten: {list}.',
  'prompt.status.wouldHold': 'Würde bei Übernahme wieder gelten: {list}.',
  'prompt.status.failed': {
    one: 'Nichts wurde übernommen. {count} Versuch, und das Dokument funktionierte immer noch nicht.',
    other: 'Nichts wurde übernommen. {count} Versuche, und das Dokument funktionierte immer noch nicht.',
  },
  'prompt.status.stopped': 'Angehalten. Nichts wurde übernommen.',
  'prompt.status.unreachable': 'Nichts wurde übernommen. Das Modell war nicht erreichbar: {reason}',
  'prompt.status.unreachableNoReason': 'Nichts wurde übernommen. Das Modell war nicht erreichbar.',
  'prompt.status.busy':
    'Nichts wurde übernommen. Eine andere Anfrage wartet noch auf die Antwort des Modells: Schließe sie zuerst ab oder halte sie an.',
  'prompt.status.declined': 'Nichts wurde übernommen. Das Modell hat diese Anfrage abgelehnt.',

  'relay.title': 'Diese Anfrage zu einem Modell bringen',
  'relay.turn': 'Runde {attempt} von höchstens {limit}',
  'relay.first': 'Kopiere die Anfrage in einen Chat mit einem Modell und füge seine ganze Antwort unten ein.',
  'relay.retry':
    'Diese Antwort hat nicht funktioniert. Kopiere, was falsch war, in denselben Chat und füge die neue Antwort unten ein.',
  'relay.leaves.authoring':
    'Dieser Bereich sendet die Anfrage nirgendwohin. Außer dem, was dem Modell über das Format gesagt wird, enthält die Anfrage deine Beschreibung und, wenn sie ein Formular ändert, das ganze Formular samt seinen Regeln. Was du kopierst, landet in deiner Zwischenablage; fügst du es in einen Chat ein, gibst du es diesem Dienst unter deinem eigenen Konto.',
  'relay.leaves.translation':
    'Dieser Bereich sendet die Anfrage nirgendwohin. Außer dem, was dem Modell über das Format gesagt wird, enthält die Anfrage die Meldungen, die dieser Sprache fehlen, wo das Formular jede davon verwendet, und seine bisherigen Übersetzungen in diese Sprache, aber keine seiner Regeln. Was du kopierst, landet in deiner Zwischenablage; fügst du es in einen Chat ein, gibst du es diesem Dienst unter deinem eigenen Konto.',
  'relay.leaves.scenarios':
    'Dieser Bereich sendet die Anfrage nirgendwohin. Außer dem, was dem Modell über das Format gesagt wird, enthält die Anfrage den Titel des Formulars, seine Felder mit ihren Beschriftungen und Optionen, die Fehlercodes, die es melden kann, die Antworten, von denen die Beispiele ausgehen, die Namen seiner Beispiele und was es laut dir tun soll, aber keine seiner Regeln. Was du kopierst, landet in deiner Zwischenablage; fügst du es in einen Chat ein, gibst du es diesem Dienst unter deinem eigenen Konto.',
  'relay.system': 'Was dem Modell über das Format gesagt wird',
  'relay.request': 'Die Anfrage',
  'relay.copy': 'Anfrage kopieren',
  'relay.copyFollowUp': 'Kopieren, was falsch war',
  'relay.copyAll': 'Neuer Chat? Die ganze Anfrage kopieren',
  'relay.open': '{name} in einem neuen Tab öffnen',
  'relay.answer': 'Die Antwort des Modells',
  'relay.check': 'Diese Antwort prüfen',
  'relay.anyway': 'Trotzdem verwenden',
  'relay.copied': 'Kopiert. Füge es in den Chat ein.',
  'relay.copyRefused':
    'Dieser Browser hat das Kopieren nicht erlaubt. Der Text ist im Feld der Anfrage markiert: Kopiere ihn von dort.',
  'relay.noObject':
    'In dieser Antwort ist kein JSON-Objekt. Kopiere die ganze Antwort samt Codeblock – oder verwende sie trotzdem, dann erfährt es das Modell.',

  'translate.ask': {
    one: 'Ein Modell um die {count} fehlende Meldung bitten',
    other: 'Ein Modell um die {count} fehlenden Meldungen bitten',
  },
  'translate.asking': 'Wird angefragt …',
  'translate.review': 'Diese Übersetzungen auf {locale} prüfen',
  'translate.review.marked': 'Diese Übersetzungen auf {locale} prüfen – einige sind zum Ansehen markiert',
  'translate.was': 'Vorher',
  'translate.now': 'Vorgeschlagen',
  'translate.flags': 'Ansehen',
  'translate.flag.stale': 'Aus einem Wortlaut übersetzt, der sich inzwischen geändert hat',
  'translate.flag.unchanged': 'Gleich wie die Quelle',
  'translate.apply': 'Diese Übersetzungen übernehmen',
  'translate.rest': 'Den Rest übersetzen',
  'translate.preview': 'Vorschau auf {locale}, wie vorgeschlagen',
  'translate.dropped':
    'Nicht geschrieben, weil niemand danach gefragt hat oder eine Person sie inzwischen übersetzt hat: {list}',
  'translate.status.asking': 'Die fehlenden Übersetzungen werden angefragt und die Antwort geprüft.',
  'translate.status.elsewhereAsking': 'Ein Modell übersetzt gerade auf {locale}. Wähle {locale}, um es zu verfolgen oder anzuhalten.',
  'translate.status.elsewhereHeld':
    'Eine Übersetzung eines Modells auf {locale} wartet auf Prüfung. Wähle {locale}, um sie zu prüfen. Nichts wurde übernommen.',
  'translate.status.goneAsking':
    'Ein Modell übersetzt gerade auf {locale}, aber {locale} ist keine Sprache des Formulars mehr. Halte es hier an, oder füge {locale} wieder hinzu, um es zu verfolgen.',
  'translate.status.goneHeld':
    'Eine Übersetzung eines Modells auf {locale} wartet auf Prüfung, aber {locale} ist keine Sprache des Formulars mehr. Verwirf sie hier, oder füge {locale} wieder hinzu, um sie zu prüfen. Nichts wurde übernommen.',
  'translate.status.ready': {
    one: 'Bereit zur Prüfung: {count} Übersetzung. Nichts wurde übernommen.',
    other: 'Bereit zur Prüfung: {count} Übersetzungen. Nichts wurde übernommen.',
  },
  'translate.status.readyAfter': {
    one: 'Bereit zur Prüfung nach {attempts} Versuchen: {count} Übersetzung. Nichts wurde übernommen.',
    other: 'Bereit zur Prüfung nach {attempts} Versuchen: {count} Übersetzungen. Nichts wurde übernommen.',
  },
  'translate.status.none': 'Das Modell hat keine Meldung übersetzt. Nichts wurde übernommen.',
  'translate.status.noneWritten': {
    one: 'Das Modell hat {count} Meldung übersetzt, und sie wurde nicht geschrieben: Niemand hat danach gefragt, oder eine Person hat sie inzwischen übersetzt. Nichts wurde übernommen.',
    other:
      'Das Modell hat {count} Meldungen übersetzt, und keine wurde geschrieben: Niemand hat danach gefragt, oder eine Person hat sie inzwischen übersetzt. Nichts wurde übernommen.',
  },
  'translate.status.stillMissing': {
    one: '{count} Meldung fehlt noch.',
    other: '{count} Meldungen fehlen noch.',
  },
  'translate.status.failed': {
    one: 'Nichts wurde übernommen. {count} Versuch, und die Antwort war immer noch kein Katalog für diese Sprache.',
    other:
      'Nichts wurde übernommen. {count} Versuche, und die Antwort war immer noch kein Katalog für diese Sprache.',
  },

  'scenarios.label': 'Szenarien',
  'scenarios.none': 'Keine Szenarien.',
  'scenarios.empty':
    'Noch keine Szenarien. Eines ist ein Beispiel mit aufgeschriebener Antwort – was dieses Formular aus bestimmten Antworten machen soll – und es ist die einzige Prüfung, die eine funktionierende Bedingung von der richtigen unterscheiden kann.',
  'scenarios.stopped': 'Gilt nicht mehr: {list}.',
  'scenarios.again': 'Gilt wieder: {list}.',
  'scenarios.allHold': { one: 'Das eine Szenario gilt.', other: 'Alle {count} Szenarien gelten.' },
  'scenarios.someFail': {
    one: '{count} von {total} gilt nicht.',
    other: '{count} von {total} gelten nicht.',
  },
  'scenarios.remove': '{name} entfernen',

  'palette.newField': 'Neues Feld',
  'palette.firstOption': 'Erste Option',
  'palette.secondOption': 'Zweite Option',
  'palette.firstRow': 'Erste Zeile',

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
  'operator.isAtLeast': 'ist mindestens',
  'operator.isAtMost': 'ist höchstens',
  'operator.isBefore': 'ist vor',
  'operator.isAfter': 'ist nach',
  'operator.contains': 'enthält',
  'operator.doesNotContain': 'enthält nicht',
  'operator.includes': 'umfasst',
  'operator.doesNotInclude': 'umfasst nicht',
} as const satisfies Record<BuilderMessageId, Message>
