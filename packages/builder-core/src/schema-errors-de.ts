import type { SchemaErrorSentences } from './messages.js'

/**
 * What the validator says, in German, by the code `@formancy/spec` gives each sentence.
 *
 * The English is the spec's and stays there; a builder speaking German shows these
 * instead, with the same values set into the same placeholders
 * ([0122](../../../docs/decisions/0122-a-validator-error-has-a-code.md)). Typed as
 * every code, so a sentence the validator gains does not compile here until it is
 * translated. What a sentence quotes as the format's own word — `renamedFrom`, `span`,
 * `all` — stays that word, because it is what the author has to type.
 */
export const SCHEMA_ERRORS_DE: SchemaErrorSentences = {
  // -------------------------------------------------------------- fields
  'repeater.nested':
    'Eine Wiederholung kann nicht in einer anderen Wiederholung stehen. Nimm sie aus der äußeren Wiederholung heraus oder mach sie zu einer Gruppe.',
  'page.nested':
    'Eine Seite kann nur auf der obersten Ebene eines Formulars stehen. Nimm sie aus „{key}“ heraus oder mach sie zu einer Gruppe.',
  'grid.rowNotFlat':
    'Die Zeilen eines Rasters sind flach, und „{key}“ enthält eigene Felder. Gib jedem dieser Felder eine eigene Spalte, oder nimm das Raster von dieser Wiederholung – dann werden ihre Zeilen untereinander gestapelt.',
  'grid.columnUnknown':
    'Kein Feld dieses Rasters hat den Schlüssel „{field}“, die Spalte würde also nichts zeigen. Nenne eines seiner eigenen Felder.',
  'grid.columnTwice':
    'Zwei Spalten zeigen beide „{field}“. Eine Antwort kann nicht zwei Spalten füllen.',
  'bounds.crossed':
    'Der früheste erlaubte Wert „{earliest}“ liegt nach dem spätesten erlaubten „{latest}“, es könnte also keine Antwort angenommen werden. Vertausche sie oder entferne einen.',
  'key.taken':
    'Ein anderes Feld verwendet bereits den Schlüssel „{key}“. Ein Schlüssel bezeichnet eine Antwort, zwei Felder können ihn also nicht teilen.',
  'key.reserved':
    '„{key}“ ist reserviert: Damit trägt eine Zeile einer Wiederholung ihre Identität, also kann kein Feld so heißen.',
  'rename.self':
    'Dieses Feld gibt an, aus sich selbst umbenannt worden zu sein. Entferne „renamedFrom“ oder setze es auf den Schlüssel, den dieses Feld früher hatte.',
  'rename.keyInUse':
    'Der Schlüssel „{key}“ wird noch von einem Feld in diesem Formular verwendet, das ist also eine Kopie und keine Umbenennung. Zwei Felder können nicht dieselben Antworten beanspruchen.',
  'rename.claimed':
    'Ein anderes Feld gibt bereits an, aus „{key}“ umbenannt worden zu sein. Alte Antworten können nur an einen Ort wandern.',
  'pattern.invalid': 'Das ist kein gültiger regulärer Ausdruck: {reason}.',
  'mask.noPositions':
    'Diese Maske hat keine Stelle zum Tippen, das Feld könnte also keine Antwort aufnehmen. Verwende 9 für eine Ziffer, a für einen Buchstaben oder * für beides.',

  // -------------------------------------------------------------- logic
  'rule.skipNoPages':
    'Eine Regel zum Überspringen führt an einer Seite vorbei, und dieses Formular hat keine Seiten. Gib ihm zuerst ein Feld vom Typ „page“ oder entferne die Regel.',
  'rule.skipNotAPage':
    '„{target}“ ist keine Seite. Eine Regel zum Überspringen nennt den Schlüssel einer Seite – {pages} – und keinen Datenpfad, weil eine Seite keine eigene Antwort trägt.',
  'rule.unknownTarget':
    'Kein Feld hat den Datenpfad „{target}“. Eine Regel kann nur für ein Feld gelten, das das Modell definiert.',
  'rule.runsOn':
    'Nur eine Regel vom Typ „validate“ oder „check“ kann wählen, wo sie läuft. Eine Regel vom Typ „{kind}“, die sich im Browser anders verhielte als auf dem Server, ließe den Server nicht prüfen, was der Browser getan hat.',
  'rule.duplicate':
    '„{target}“ hat bereits eine Regel vom Typ „{kind}“. Ein Feld kann eine Regel pro Typ tragen, weil bei zweien kein Gewinner festgelegt wäre.',

  // ------------------------------------------------------- translations
  'i18n.noDefaultCatalogue':
    'Es gibt keinen Katalog für „{locale}“ – die Sprache, auf die alles zurückfällt, enthält also keine Wörter.',
  'i18n.noSection':
    '„{id}“ verweist auf eine Übersetzung, aber dieses Formular hat keinen Abschnitt „i18n“.',
  'i18n.unknownMessage': 'Keine Meldung namens „{id}“ im Katalog für „{locale}“.',

  // ----------------------------------------------------------- layouts
  'layout.nameTaken':
    'Ein anderes Layout heißt bereits „{name}“. Ein Layout wird über seinen Namen angefordert, zwei können ihn also nicht teilen.',
  'layout.spanOutsideTable':
    '„span“ sagt, wie viele Spalten einer Tabelle zu belegen sind, und dieser Knoten steht in keiner Tabelle. Setz ihn in einen Tabellenknoten oder entferne „span“.',
  'layout.spanTooWide':
    'Das belegt {span} Spalten in einer Tabelle mit {columns}. Verwende „all“ für die volle Breite, damit es stimmt, wenn sich die Spaltenzahl ändert.',
  'layout.codeUnknownPath':
    'Kein Feld hat den Datenpfad „{path}“, dieser Code würde also nichts codieren.',
  'layout.codeNeedsLabel':
    'Dieser Code braucht eine Beschriftung, die sagt, was er ist. Das Bild lässt sich nicht vorlesen, und der Wert darunter ist eine bloße Zeichenkette – die Beschriftung ist also das Einzige, woran sich ein Screenreader halten kann.',
  'layout.unknownPath':
    'Kein Feld hat den Datenpfad „{path}“, dieses Layout platziert hier also nichts.',
  'layout.placedTwice':
    '„{path}“ ist im Layout „{layout}“ bereits platziert. Ein Feld hat in einer Anordnung einen Platz.',
  'layout.tabNotSection':
    'Ein Reiterknoten enthält Abschnitte, einen pro Reiter, und dieser enthält ein „{kind}“. Pack es in einen Abschnitt und gib dem Abschnitt eine Beschriftung – diese Beschriftung ist der Name des Reiters.',
  'layout.tabUnnamed':
    'Dieser Reiter hat keinen Namen, also kann niemand sagen, was dahinter liegt. Gib dem Abschnitt eine Beschriftung.',
  'layout.tabsEmpty': 'Ein Reiterknoten ohne Reiter zeigt gar nichts.',
  'layout.columnsWhole': 'Die Spaltenzahl einer Tabelle muss eine ganze Zahl sein.',

  // ----------------------------------------------- spec versions
  'version.widget':
    'Die Darstellung „{widget}“ braucht specVersion „{version}“. Dieses Dokument sagt „{declared}“. Ändere es auf „{version}“ – alles, was schon im Dokument steht, funktioniert weiter, weil eine spätere Version nur hinzufügt.',
  'version.bound':
    'Eine Grenze „{bound}“ braucht specVersion „{version}“. Dieses Dokument sagt „{declared}“. Ändere es auf „{version}“ – alles, was schon im Dokument steht, funktioniert weiter, weil eine spätere Version nur hinzufügt.',
  'version.step':
    'Ein „step“ braucht specVersion „{version}“. Dieses Dokument sagt „{declared}“. Ändere es auf „{version}“ – alles, was schon im Dokument steht, funktioniert weiter, weil eine spätere Version nur hinzufügt.',
  'version.mask':
    'Eine „mask“ braucht specVersion „{version}“. Dieses Dokument sagt „{declared}“. Ändere es auf „{version}“ – alles, was schon im Dokument steht, funktioniert weiter, weil eine spätere Version nur hinzufügt.',
  'version.optionsSource':
    'Eine „optionsSource“ braucht specVersion „{version}“. Dieses Dokument sagt „{declared}“. Ändere es auf „{version}“ – alles, was schon im Dokument steht, funktioniert weiter, weil eine spätere Version nur hinzufügt.',
  'version.fieldType':
    'Ein Feld vom Typ „{type}“ braucht specVersion „{version}“. Dieses Dokument sagt „{declared}“. Ändere es auf „{version}“ – alles, was schon im Dokument steht, funktioniert weiter, weil eine spätere Version nur hinzufügt.',
  'version.ruleKind':
    'Eine Regel vom Typ „{kind}“ braucht specVersion „{version}“. Dieses Dokument sagt „{declared}“. Ändere es auf „{version}“ – alles, was schon im Dokument steht, funktioniert weiter, weil eine spätere Version nur hinzufügt.',
  'version.layoutKind':
    'Ein Layoutknoten vom Typ „{kind}“ braucht specVersion „{version}“. Dieses Dokument sagt „{declared}“. Ändere es auf „{version}“ – alles, was schon im Dokument steht, funktioniert weiter, weil eine spätere Version nur hinzufügt.',

  // ------------------------------------- the shape, as the JSON Schema checks it
  'options.twoSources':
    'Dieses Feld listet seine Auswahlmöglichkeiten auf und nennt zugleich eine Quelle dafür, und es gibt keine Regel, welche gewinnt. Behalte die Liste, oder behalte die Quelle und entferne die Liste.',
  'shape.notAllowed': 'Das ist hier nicht erlaubt.',
  'shape.object': 'Muss ein Objekt sein.',
  'shape.array': 'Muss eine Liste sein.',
  'shape.string': 'Muss Text sein.',
  'shape.number': 'Muss eine Zahl sein.',
  'shape.integer': 'Muss eine ganze Zahl sein.',
  'shape.boolean': 'Muss true oder false sein.',
  'shape.null': 'Muss null sein.',
  'shape.type': 'Muss vom Typ {type} sein.',
  'shape.required': 'Die verlangte Eigenschaft „{property}“ fehlt.',
  'shape.childFields': 'Nur Gruppen, Seiten und Wiederholungen können eigene Felder enthalten.',
  'shape.unknownProperty':
    'Unbekannte Eigenschaft „{property}“. Prüf die Schreibweise oder entferne sie.',
  'shape.const': 'Muss {value} sein.',
  'shape.notOneOf': '{found} ist keiner der erlaubten Werte: {allowed}.',
  'shape.fieldKey':
    '{found} ist kein brauchbarer Feldschlüssel. Beginne mit einem Buchstaben oder einem Unterstrich und verwende danach nur Buchstaben, Ziffern und Unterstriche.',
  'shape.formId':
    '{found} ist keine brauchbare Formular-ID. Beginne mit einem Buchstaben oder einer Ziffer und verwende danach nur Buchstaben, Ziffern, Punkte, Bindestriche und Unterstriche.',
  'shape.checkName':
    '{found} ist kein brauchbarer Name für eine Prüfung. Nenne die Prüfung und lass die Installation sagen, wo gefragt wird – eine Adresse hier wäre ein Detail der Installation, eingefroren in ein veröffentlichtes Formular, und ein Weg, einen Server in einem privaten Netz etwas abrufen zu lassen.',
  'shape.pattern': '{found} passt nicht zum verlangten Muster {pattern}.',
  'shape.maxLength': 'Darf höchstens {limit} Zeichen lang sein.',
  'shape.empty': 'Darf nicht leer sein.',
  'shape.minLength': 'Muss mindestens {limit} Zeichen lang sein.',
  // ajv's own wording, which no translation reaches: see the English.
  'shape.other': '{detail}',
}
