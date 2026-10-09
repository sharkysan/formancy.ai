import type { SchemaWords } from './messages.js'

/**
 * The spec's own words — a property's title and description, a field type's name
 * and what it is for — in German.
 *
 * Keyed by the English the spec's JSON Schema writes, which stays the one source
 * the reference documentation and the property panel both read. A key is the
 * source text a translator translates, and `schema-words.test.ts` derives the set
 * of texts from the schema: rewording one there leaves its translation behind and
 * fails the test, rather than silently showing English
 * ([0121](../../../docs/decisions/0121-the-specs-words-are-translated-beside-it.md)).
 */
export const SCHEMA_WORDS_DE: SchemaWords = {
  Required: 'Pflichtfeld',
  'Whether the form can be sent without an answer to this field. Turning this on for a field that already exists invalidates the submissions that left it empty, so publishing reports it as a lossy change.':
    'Ob das Formular ohne Antwort auf dieses Feld abgeschickt werden kann. Bei einem bestehenden Feld macht das Einschalten die Einsendungen ungültig, die es leer gelassen haben – das Veröffentlichen meldet es deshalb als verlustbehaftete Änderung.',
  'Clear when hidden': 'Beim Verbergen leeren',
  'What happens to an answer when a rule hides its field. On (the default), the answer is removed from the submission, so a hidden branch cannot carry data. Off, the answer is kept and comes back when the field reappears.':
    'Was mit einer Antwort geschieht, wenn eine Regel ihr Feld verbirgt. Ein (der Standard): Die Antwort wird aus der Einsendung entfernt, sodass ein verborgener Zweig keine Daten mitführen kann. Aus: Die Antwort bleibt und kommt zurück, wenn das Feld wieder erscheint.',
  Label: 'Beschriftung',
  'What the person filling the form in reads next to this field, or a reference to it in the message catalogue.':
    'Was die Person, die das Formular ausfüllt, neben diesem Feld liest – oder ein Verweis darauf im Meldungskatalog.',
  'Minimum length': 'Mindestlänge',
  'The shortest answer that counts, in characters.': 'Die kürzeste gültige Antwort, in Zeichen.',
  'Maximum length': 'Höchstlänge',
  'The longest answer that counts, in characters.': 'Die längste gültige Antwort, in Zeichen.',
  Pattern: 'Muster',
  'A regular expression the whole answer must match. Checked when the form is saved, so a broken or dangerous pattern never reaches a person filling the form in.':
    'Ein regulärer Ausdruck, auf den die ganze Antwort passen muss. Geprüft beim Speichern des Formulars, sodass ein fehlerhaftes oder gefährliches Muster nie bei einer ausfüllenden Person ankommt.',
  Format: 'Format',
  'A named shape the answer must have. A closed list on purpose: each entry is one well-tested check, not a per-form regular expression.':
    'Eine benannte Form, die die Antwort haben muss. Bewusst eine geschlossene Liste: Jeder Eintrag ist eine gut getestete Prüfung, kein regulärer Ausdruck pro Formular.',
  Widget: 'Darstellung',
  'How this field should look. Presentation only: it never changes what the field collects or what is stored. Leave it out for the default control. Offer a camera route to a value somebody could otherwise type, such as reading a QR code. The answer is still the same string, and typing it must stay possible.':
    'Wie dieses Feld aussehen soll. Nur Darstellung: Es ändert nie, was das Feld erfasst oder was gespeichert wird. Weglassen ergibt das Standard-Bedienelement. Bietet einen Weg über die Kamera zu einem Wert, den man sonst tippen würde, etwa durch Lesen eines QR-Codes. Die Antwort bleibt dieselbe Zeichenkette, und Tippen muss möglich bleiben.',
  Minimum: 'Minimum',
  'The smallest value that counts as a valid answer.': 'Der kleinste Wert, der als gültige Antwort zählt.',
  Maximum: 'Maximum',
  'The largest value that counts as a valid answer.': 'Der größte Wert, der als gültige Antwort zählt.',
  Step: 'Schrittweite',
  'The granularity of the answer, and the distance a slider moves. Counted from the minimum when there is one, and from zero when there is not — so a step of 5 with a minimum of 2 accepts 2, 7 and 12. Must be greater than zero. Needs spec version 4.':
    'Die Feinheit der Antwort und der Weg, den ein Schieberegler zurücklegt. Gezählt ab dem Minimum, wenn es eines gibt, sonst ab null – eine Schrittweite von 5 mit einem Minimum von 2 akzeptiert also 2, 7 und 12. Muss größer als null sein. Braucht Spec-Version 4.',
  'How this field should look. Presentation only: it never changes what the field collects or what is stored. Leave it out for the default control. Show a scale of stars or numbers between the minimum and the maximum, or a track to drag. The answer is unchanged: still one number, and still subject to the minimum, maximum and step. Needs spec version 4.':
    'Wie dieses Feld aussehen soll. Nur Darstellung: Es ändert nie, was das Feld erfasst oder was gespeichert wird. Weglassen ergibt das Standard-Bedienelement. Zeigt eine Skala aus Sternen oder Zahlen zwischen Minimum und Maximum oder eine Leiste zum Ziehen. Die Antwort bleibt unverändert: eine Zahl, weiterhin an Minimum, Maximum und Schrittweite gebunden. Braucht Spec-Version 4.',
  'How this field should look. Presentation only: it never changes what the field collects or what is stored. Leave it out for the default control. Show the tick-box as a switch. The answer is unchanged: still true, false, or untouched.':
    'Wie dieses Feld aussehen soll. Nur Darstellung: Es ändert nie, was das Feld erfasst oder was gespeichert wird. Weglassen ergibt das Standard-Bedienelement. Zeigt das Ankreuzfeld als Schalter. Die Antwort bleibt unverändert: wahr, falsch oder unberührt.',
  Options: 'Auswahlmöglichkeiten',
  'The answers this field offers, in the order they appear.':
    'Die Antworten, die dieses Feld anbietet, in der Reihenfolge, in der sie erscheinen.',
  'How this field should look. Presentation only: it never changes what the field collects or what is stored. Leave it out for the default control. Let somebody type to narrow the options instead of scrolling them. The answer is still one of the options offered.':
    'Wie dieses Feld aussehen soll. Nur Darstellung: Es ändert nie, was das Feld erfasst oder was gespeichert wird. Weglassen ergibt das Standard-Bedienelement. Lässt jemanden tippen, um die Auswahl einzugrenzen, statt durch sie zu blättern. Die Antwort bleibt eine der angebotenen Möglichkeiten.',
  'Options source': 'Quelle der Auswahl',
  "Where this field's answers come from, when there are too many to write into the form or they change too often. This is a NAME the deployment resolves to a list — never an address: the form never says where to look, so moving it between staging and production changes nothing here. The value that gets stored is a code only that source can decode, and a published version is frozen forever, so it has to still mean the same thing in a year. Leave it out and the field offers the options written above.":
    'Woher die Antworten dieses Felds kommen, wenn es zu viele sind, um sie ins Formular zu schreiben, oder sie sich zu oft ändern. Das ist ein NAME, den die Installation in eine Liste auflöst – nie eine Adresse: Das Formular sagt nie, wo es nachsehen soll, ein Umzug zwischen Test und Produktion ändert hier also nichts. Gespeichert wird ein Code, den nur diese Quelle entschlüsseln kann, und eine veröffentlichte Version ist für immer eingefroren – er muss also in einem Jahr noch dasselbe bedeuten. Weglassen, und das Feld bietet die oben eingetragenen Möglichkeiten an.',
  'Fewest choices': 'Wenigste Auswahl',
  'How many options must be ticked. Leave it unset to accept any number — and use `required` rather than a minimum of 1, so the reader is told the field is required before they touch it.':
    'Wie viele Möglichkeiten angekreuzt sein müssen. Nicht gesetzt, wird jede Anzahl akzeptiert – und nimm `required` statt eines Minimums von 1, damit die Person erfährt, dass das Feld Pflicht ist, bevor sie es berührt.',
  'Most choices': 'Höchste Auswahl',
  'How many options may be ticked at once.': 'Wie viele Möglichkeiten gleichzeitig angekreuzt sein dürfen.',
  'How this field should look. Presentation only: it never changes what the field collects. `tagpicker` narrows a long list by typing and shows the answers as chips; the answer is still an array of offered option values, in the options’ own order.':
    'Wie dieses Feld aussehen soll. Nur Darstellung: Es ändert nie, was das Feld erfasst. `tagpicker` grenzt eine lange Liste durch Tippen ein und zeigt die Antworten als Marken; die Antwort bleibt eine Liste angebotener Werte, in der Reihenfolge der Auswahl selbst.',
  'Earliest allowed': 'Frühester Wert',
  'The earliest date this field accepts, inclusive, written exactly as an answer is: 2026-09-19. A fixed value, not an expression and not the current date — a bound that moved with the clock would let the same submission pass in the browser and fail on the server. For "must be in the future", write a rule.':
    'Das früheste Datum, das dieses Feld akzeptiert, einschließlich, genau so geschrieben wie eine Antwort: 2026-09-19. Ein fester Wert, kein Ausdruck und nicht das heutige Datum – eine Grenze, die mit der Uhr wandert, ließe dieselbe Einsendung im Browser durch und auf dem Server scheitern. Für „muss in der Zukunft liegen“ schreib eine Regel.',
  'Latest allowed': 'Spätester Wert',
  'The latest date this field accepts, inclusive, written exactly as an answer is: 2026-09-19. A fixed value, not an expression and not the current date — a bound that moved with the clock would let the same submission pass in the browser and fail on the server. For "must be in the future", write a rule.':
    'Das späteste Datum, das dieses Feld akzeptiert, einschließlich, genau so geschrieben wie eine Antwort: 2026-09-19. Ein fester Wert, kein Ausdruck und nicht das heutige Datum – eine Grenze, die mit der Uhr wandert, ließe dieselbe Einsendung im Browser durch und auf dem Server scheitern. Für „muss in der Zukunft liegen“ schreib eine Regel.',
  'The earliest time this field accepts, inclusive, written exactly as an answer is: 09:30. A fixed value, not an expression and not the current time — a bound that moved with the clock would let the same submission pass in the browser and fail on the server. For "must be in the future", write a rule.':
    'Die früheste Uhrzeit, die dieses Feld akzeptiert, einschließlich, genau so geschrieben wie eine Antwort: 09:30. Ein fester Wert, kein Ausdruck und nicht die aktuelle Uhrzeit – eine Grenze, die mit der Uhr wandert, ließe dieselbe Einsendung im Browser durch und auf dem Server scheitern. Für „muss in der Zukunft liegen“ schreib eine Regel.',
  'The latest time this field accepts, inclusive, written exactly as an answer is: 09:30. A fixed value, not an expression and not the current time — a bound that moved with the clock would let the same submission pass in the browser and fail on the server. For "must be in the future", write a rule.':
    'Die späteste Uhrzeit, die dieses Feld akzeptiert, einschließlich, genau so geschrieben wie eine Antwort: 09:30. Ein fester Wert, kein Ausdruck und nicht die aktuelle Uhrzeit – eine Grenze, die mit der Uhr wandert, ließe dieselbe Einsendung im Browser durch und auf dem Server scheitern. Für „muss in der Zukunft liegen“ schreib eine Regel.',
  'The earliest date and time this field accepts, inclusive, written exactly as an answer is: 2026-09-19T08:00:00Z. A fixed value, not an expression and not the current date and time — a bound that moved with the clock would let the same submission pass in the browser and fail on the server. For "must be in the future", write a rule.':
    'Der früheste Zeitpunkt, den dieses Feld akzeptiert, einschließlich, genau so geschrieben wie eine Antwort: 2026-09-19T08:00:00Z. Ein fester Wert, kein Ausdruck und nicht der aktuelle Zeitpunkt – eine Grenze, die mit der Uhr wandert, ließe dieselbe Einsendung im Browser durch und auf dem Server scheitern. Für „muss in der Zukunft liegen“ schreib eine Regel.',
  'The latest date and time this field accepts, inclusive, written exactly as an answer is: 2026-09-19T08:00:00Z. A fixed value, not an expression and not the current date and time — a bound that moved with the clock would let the same submission pass in the browser and fail on the server. For "must be in the future", write a rule.':
    'Der späteste Zeitpunkt, den dieses Feld akzeptiert, einschließlich, genau so geschrieben wie eine Antwort: 2026-09-19T08:00:00Z. Ein fester Wert, kein Ausdruck und nicht der aktuelle Zeitpunkt – eine Grenze, die mit der Uhr wandert, ließe dieselbe Einsendung im Browser durch und auf dem Server scheitern. Für „muss in der Zukunft liegen“ schreib eine Regel.',
  'Accepted file types': 'Erlaubte Dateitypen',
  'Media types or extensions, such as `application/pdf` or `.png` — the same grammar the HTML `accept` attribute uses, so the file picker filters on exactly what the server then enforces. A filter in the browser alone is a suggestion, not a rule.':
    'Medientypen oder Endungen wie `application/pdf` oder `.png` – dieselbe Schreibweise wie das HTML-Attribut `accept`, sodass die Dateiauswahl genau das filtert, was der Server dann durchsetzt. Ein Filter nur im Browser ist eine Empfehlung, keine Regel.',
  'Largest file': 'Größte Datei',
  'The size limit for one file, in bytes. The server checks it as well, because the browser cannot be trusted to.':
    'Die Größengrenze für eine Datei, in Bytes. Der Server prüft sie ebenfalls, weil man sich darauf beim Browser nicht verlassen kann.',
  'Fewest files': 'Wenigste Dateien',
  'How many files must be attached.': 'Wie viele Dateien angehängt sein müssen.',
  'Most files': 'Meiste Dateien',
  'How many files may be attached.': 'Wie viele Dateien angehängt sein dürfen.',
  'Longest answer': 'Längste Antwort',
  'The cap on the answer, counted in characters of the stored markup rather than of the text a reader sees.':
    'Die Obergrenze der Antwort, gezählt in Zeichen des gespeicherten Markups, nicht des Texts, den man liest.',
  'Signing box': 'Unterschriftsfeld',
  'The width and height the points are recorded in — a coordinate space, not pixels on anybody’s screen. It belongs to the field rather than to each answer, so two signatures on one form are comparable and a stored one can be redrawn at any size.':
    'Breite und Höhe, in denen die Punkte erfasst werden – ein Koordinatenraum, keine Pixel auf irgendeinem Bildschirm. Er gehört zum Feld, nicht zu jeder Antwort, sodass zwei Unterschriften in einem Formular vergleichbar sind und eine gespeicherte in jeder Größe neu gezeichnet werden kann.',
  'Most points': 'Meiste Punkte',
  'How many points one answer may carry across all its strokes. An unbounded point list is a payload amplifier, so this has a ceiling like everything else here.':
    'Wie viele Punkte eine Antwort über alle Striche hinweg enthalten darf. Eine unbegrenzte Punktliste vervielfacht die Datenmenge, also hat auch sie eine Obergrenze wie alles andere hier.',
  'Minimum rows': 'Mindestanzahl Zeilen',
  'How many rows the form opens with and will not go below. A repeater that promises one row shows one empty row, not an add button and a shrug.':
    'Mit wie vielen Zeilen das Formular beginnt und unter wie viele es nicht fällt. Eine Wiederholung, die eine Zeile verspricht, zeigt eine leere Zeile – nicht einen Hinzufügen-Knopf und ein Achselzucken.',
  'Maximum rows': 'Höchstanzahl Zeilen',
  'How many rows a person may add.': 'Wie viele Zeilen jemand hinzufügen darf.',
  'Add button label': 'Beschriftung des Hinzufügen-Knopfs',
  'The accessible name of the control that adds a row.':
    'Der zugängliche Name des Bedienelements, das eine Zeile hinzufügt.',
  'Remove button label': 'Beschriftung des Entfernen-Knopfs',
  "The accessible name of the control that removes a row. The renderer appends the row's position, so a screen reader user hears which row a button kills.":
    'Der zugängliche Name des Bedienelements, das eine Zeile entfernt. Der Renderer hängt die Position der Zeile an, sodass jemand mit Screenreader hört, welche Zeile ein Knopf löscht.',
  'How this field should look. Presentation only: it never changes what the field collects or what is stored. Leave it out for the default control. Show the rows as a table with aligned columns instead of stacked blocks. The answer is unchanged.':
    'Wie dieses Feld aussehen soll. Nur Darstellung: Es ändert nie, was das Feld erfasst oder was gespeichert wird. Weglassen ergibt das Standard-Bedienelement. Zeigt die Zeilen als Tabelle mit ausgerichteten Spalten statt als gestapelte Blöcke. Die Antwort bleibt unverändert.',
  Columns: 'Spalten',
  "Which of this grid's fields become columns, and in what order. Leave it out to arrange every field in the order they are defined. A field left out is still collected and still shown, after the configured columns — a column list is an ordering, not a choice of which answers to keep.":
    'Welche Felder dieses Rasters zu Spalten werden, und in welcher Reihenfolge. Weglassen ordnet jedes Feld in der Reihenfolge seiner Definition an. Ein ausgelassenes Feld wird weiterhin erfasst und angezeigt, nach den eingerichteten Spalten – eine Spaltenliste ist eine Reihenfolge, keine Auswahl, welche Antworten bleiben.',
  'Column span': 'Spaltenbreite',
  'How many of the surrounding table\'s columns this takes. Only inside a table: elsewhere it is refused rather than ignored. Use "all" for the full width — it is what somebody means and it survives a change to the column count, where a number does not. Anything a person works inside rather than answers in a word — a rich text editor, a file dropzone, a long text area — usually wants the full width.':
    'Wie viele Spalten der umgebenden Tabelle dies einnimmt. Nur in einer Tabelle: Anderswo wird es abgelehnt statt ignoriert. Nimm „all“ für die volle Breite – das ist, was man meint, und es übersteht eine Änderung der Spaltenzahl, eine Zahl nicht. Alles, worin man arbeitet statt mit einem Wort zu antworten – ein Editor für formatierten Text, eine Ablagefläche für Dateien, ein langes Textfeld –, will meist die volle Breite.',
  Heading: 'Überschrift',
  'Optional heading for the group.': 'Optionale Überschrift der Gruppe.',
  'Name of the tab strip': 'Name der Reiterleiste',
  'Names the strip itself, not a tab. Two sets of tabs in one form are otherwise both announced as "tab list", and somebody using a screen reader cannot tell which is which.':
    'Benennt die Leiste selbst, keinen Reiter. Zwei Reitergruppen in einem Formular werden sonst beide als „Registerkartenliste“ angesagt, und wer einen Screenreader nutzt, kann sie nicht unterscheiden.',
  'How many columns at full width. Narrower than that and it collapses to one, so the form still works at 320 pixels without sideways scrolling.':
    'Wie viele Spalten bei voller Breite. Schmaler als das, fällt es auf eine zusammen, sodass das Formular auch bei 320 Pixeln ohne seitliches Scrollen funktioniert.',
  'Optional heading for the grid.': 'Optionale Überschrift des Rasters.',
  "What a reader is told this code IS. Required, because it is the code's accessible content: the picture is decoration a screen reader cannot use, and the value beneath it is a bare string — a booking reference announced with nothing to say what it is. Not the field's own label, which names the control somewhere else on the page.":
    'Was einer Person gesagt wird, was dieser Code IST. Pflicht, weil es der zugängliche Inhalt des Codes ist: Das Bild ist Dekoration, mit der ein Screenreader nichts anfangen kann, und der Wert darunter ist eine nackte Zeichenkette – eine Buchungsnummer, angesagt ohne einen Hinweis, was sie ist. Nicht die Beschriftung des Felds selbst, die das Bedienelement an anderer Stelle der Seite benennt.',
  'Single-line text': 'Einzeiliger Text',
  'One line of free text: a name, a reference, a short answer.':
    'Eine Zeile freier Text: ein Name, eine Referenz, eine kurze Antwort.',
  'Multi-line text': 'Mehrzeiliger Text',
  'A box several lines tall, for a message or a description.':
    'Ein mehrere Zeilen hohes Feld für eine Nachricht oder eine Beschreibung.',
  Number: 'Zahl',
  'A numeric answer, for amounts and counts. Do not use it for phone numbers, postcodes or account numbers: those lose their leading zeros.':
    'Eine Zahlenantwort für Beträge und Anzahlen. Nicht für Telefonnummern, Postleitzahlen oder Kontonummern verwenden: Die verlieren ihre führenden Nullen.',
  Checkbox: 'Ankreuzfeld',
  'A single yes-or-no answer, such as accepting the terms.':
    'Eine einzelne Ja-oder-nein-Antwort, etwa die Zustimmung zu den Bedingungen.',
  Dropdown: 'Auswahlliste',
  'One answer picked from a list, shown collapsed. Best when the list is long.':
    'Eine Antwort aus einer Liste, zugeklappt angezeigt. Am besten bei langen Listen.',
  'Radio buttons': 'Optionsfelder',
  'One answer picked from a list, with every option visible at once. Best for a handful of options.':
    'Eine Antwort aus einer Liste, bei der alle Möglichkeiten gleichzeitig sichtbar sind. Am besten bei einer Handvoll Möglichkeiten.',
  Date: 'Datum',
  'A calendar date, with no time of day.': 'Ein Kalenderdatum ohne Uhrzeit.',
  'Hidden value': 'Verborgener Wert',
  'Travels with the submission but is never shown to the reader, such as a campaign code or a referral source.':
    'Reist mit der Einsendung, wird der Person aber nie gezeigt – etwa ein Kampagnencode oder eine Herkunftsangabe.',
  'Static text': 'Statischer Text',
  'Text shown to the reader that collects nothing: a heading, an explanation, a notice.':
    'Text für die Person, der nichts erfasst: eine Überschrift, eine Erklärung, ein Hinweis.',
  Group: 'Gruppe',
  'Related fields kept together on the same page. Collects nothing itself.':
    'Zusammengehörige Felder, die auf derselben Seite beisammen bleiben. Erfasst selbst nichts.',
  Repeater: 'Wiederholung',
  'A set of fields the reader can fill in more than once, such as one block per passenger. A repeater cannot be placed inside another repeater in this version of the spec.':
    'Eine Gruppe von Feldern, die man mehrmals ausfüllen kann, etwa ein Block pro Fahrgast. Eine Wiederholung kann in dieser Version der Spec nicht in einer anderen stehen.',
  Checkboxes: 'Ankreuzfelder',
  'Several answers picked from a list, every option visible at once. The answer is the list of values chosen, so an option removed later leaves the submissions that chose it unchanged.':
    'Mehrere Antworten aus einer Liste, alle Möglichkeiten gleichzeitig sichtbar. Die Antwort ist die Liste der gewählten Werte, sodass eine später entfernte Möglichkeit die Einsendungen, die sie gewählt haben, unverändert lässt.',
  Time: 'Uhrzeit',
  'A time of day, with no date and no time zone: opening hours, an appointment slot. Stored as "HH:MM" on a 24-hour clock, zero-padded, so that comparing two answers as text gives the same order as comparing them as times. Because it carries no zone it is not an instant and cannot be compared with the current time.':
    'Eine Tageszeit ohne Datum und ohne Zeitzone: Öffnungszeiten, ein Termin. Gespeichert als „HH:MM“ im 24-Stunden-Format mit führenden Nullen, damit der Vergleich zweier Antworten als Text dieselbe Reihenfolge ergibt wie als Uhrzeiten. Weil sie keine Zone trägt, ist sie kein Zeitpunkt und lässt sich nicht mit der aktuellen Uhrzeit vergleichen.',
  'Date and time': 'Datum und Uhrzeit',
  'One moment in time, stored as "YYYY-MM-DDTHH:MM:SSZ" — always UTC, always with seconds. A reader types and reads it in their own zone; the answer records the instant. Numeric offsets are refused because "…10:00:00+03:00" sorts after "…08:00:00Z" as text while being earlier in fact, and the ordering is what makes an earliest or latest bound mean anything.':
    'Ein Zeitpunkt, gespeichert als „YYYY-MM-DDTHH:MM:SSZ“ – immer UTC, immer mit Sekunden. Man tippt und liest ihn in der eigenen Zone; die Antwort hält den Moment fest. Numerische Versätze werden abgelehnt, weil „…10:00:00+03:00“ als Text nach „…08:00:00Z“ sortiert, obwohl es tatsächlich früher ist – und erst die Ordnung gibt einer frühesten oder spätesten Grenze einen Sinn.',
  'File upload': 'Datei-Upload',
  'One or more attached files. The submission stores what each file is and where it went — never its bytes — so a submission stays small and readable on its own.':
    'Eine oder mehrere angehängte Dateien. Die Einsendung speichert, was jede Datei ist und wohin sie ging – nie ihre Bytes –, sodass eine Einsendung klein und für sich lesbar bleibt.',
  'Formatted text': 'Formatierter Text',
  'Several lines of text the reader can emphasise, link and list. Stored as a restricted markup, not as HTML: nothing a reader writes is ever parsed as markup by the renderer, which is what keeps a submitted answer from becoming a script on the page that displays it.':
    'Mehrere Zeilen Text, die man hervorheben, verlinken und als Liste setzen kann. Gespeichert als eingeschränktes Markup, nicht als HTML: Nichts, was jemand schreibt, wird vom Renderer je als Markup gelesen – das verhindert, dass eine eingesandte Antwort zum Skript auf der Seite wird, die sie anzeigt.',
  Signature: 'Unterschrift',
  'A mark somebody draws, or their name typed. Stored as points rather than as a picture, so it scales, diffs and means something to a reader that is not a browser — and never as stroke timing, which is what would make it biometric data.':
    'Ein Zeichen, das jemand zeichnet, oder der getippte Name. Gespeichert als Punkte statt als Bild, sodass es skaliert, sich vergleichen lässt und auch außerhalb eines Browsers etwas bedeutet – und nie als Strich-Timing, das es zu biometrischen Daten machen würde.',
}
