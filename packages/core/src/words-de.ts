import type { FormWordId, Message } from './words.js'

/**
 * German, shipped and complete.
 *
 * Complete because a shipped language with a gap is a form half in it, which reads worse
 * than one wholly in English: the reader cannot tell which of the two the form meant. The
 * compiler refuses a missing word here, and `words.test.ts` a missing placeholder.
 *
 * Written for somebody filling in a form, so in the register a form addresses a stranger
 * in: "Sie". The builder says "du" to the person building, and that is a different
 * relationship ([0114](../../../docs/decisions/0114-the-builder-speaks-the-authors-language.md)).
 *
 * Its own file because a translation changes for a different reason from the English it
 * translates.
 */
export const FORM_WORDS_DE = {
  'form.submit': 'Absenden',
  'form.next': 'Weiter',
  'form.back': 'Zurück',
  'form.progress': 'Fortschritt',
  'form.required': 'erforderlich',

  'errors.heading': {
    one: 'Es gibt {count} Problem zu beheben',
    other: 'Es gibt {count} Probleme zu beheben',
  },
  'errors.entry': '{label}: {problems}',

  'error.required': 'Diese Frage braucht eine Antwort.',
  'error.required.checkbox': 'Setzen Sie hier ein Häkchen, um fortzufahren.',
  'error.required.rows': 'Fügen Sie mindestens eine Zeile hinzu.',
  'error.required.files': 'Hängen Sie eine Datei an.',
  'error.invalid': 'Diese Antwort wird nicht angenommen.',
  'error.check_unavailable': 'Diese Antwort konnte gerade nicht geprüft werden. Versuchen Sie es gleich noch einmal.',
  'error.type': 'Diese Art von Antwort passt nicht zu dieser Frage.',
  'error.option': 'Wählen Sie eine der angebotenen Optionen.',
  'error.duplicate': 'Ordnen Sie jede Option nur einmal ein.',
  'error.row': 'Beantworten Sie nur die Zeilen, nach denen gefragt wird.',
  'error.min': 'Geben Sie {min} oder mehr ein.',
  'error.max': 'Geben Sie {max} oder weniger ein.',
  'error.step': 'Geben Sie einen Wert in Schritten von {step} ein.',
  'error.minLength': { one: 'Geben Sie mindestens {count} Zeichen ein.', other: 'Geben Sie mindestens {count} Zeichen ein.' },
  'error.maxLength': { one: 'Geben Sie höchstens {count} Zeichen ein.', other: 'Geben Sie höchstens {count} Zeichen ein.' },
  'error.pattern': 'Geben Sie die Antwort in der verlangten Form ein.',
  'error.mask': 'Füllen Sie jede Stelle des gezeigten Formats mit dem aus, was sie verlangt.',
  'error.email': 'Geben Sie eine E-Mail-Adresse ein, zum Beispiel name@example.com.',
  'error.url': 'Geben Sie eine Webadresse ein, die mit https:// oder http:// beginnt.',
  'error.uuid': 'Geben Sie eine Kennung aus 32 Hexadezimalziffern in fünf Gruppen ein.',
  'error.shape': 'Geben Sie die Antwort als {format} ein.',
  // A colon rather than a sentence: a date needs an article ("den 3. Mai") that a time must not have.
  'error.earliest': 'Frühestens: {earliest}.',
  'error.latest': 'Spätestens: {latest}.',
  'error.minItems.choices': { one: 'Wählen Sie mindestens {count} aus.', other: 'Wählen Sie mindestens {count} aus.' },
  'error.maxItems.choices': { one: 'Wählen Sie höchstens {count} aus.', other: 'Wählen Sie höchstens {count} aus.' },
  'error.minItems.files': { one: 'Hängen Sie mindestens {count} Datei an.', other: 'Hängen Sie mindestens {count} Dateien an.' },
  'error.maxItems.files': { one: 'Hängen Sie höchstens {count} Datei an.', other: 'Hängen Sie höchstens {count} Dateien an.' },
  'error.minItems.rows': { one: 'Fügen Sie mindestens {count} Zeile hinzu.', other: 'Fügen Sie mindestens {count} Zeilen hinzu.' },
  'error.maxItems.rows': { one: 'Fügen Sie höchstens {count} Zeile hinzu.', other: 'Fügen Sie höchstens {count} Zeilen hinzu.' },
  'error.maxFileSize': 'Eine Datei darf höchstens {maxFileSize} groß sein.',
  'error.accept': 'Hängen Sie eine Datei eines dieser Typen an: {accept}.',
  'error.box': 'Die Unterschrift geht über ihr Feld hinaus. Löschen Sie sie und unterschreiben Sie erneut.',
  'error.maxPoints': 'Die Unterschrift ist zu detailliert, um sie zu speichern. Löschen Sie sie und unterschreiben Sie erneut.',

  'answer.yes': 'Ja',
  'answer.no': 'Nein',
  'answer.drawnSignature': 'Eine gezeichnete Unterschrift',
  'answer.row': '{label} {position}',

  'repeater.add': '{label} hinzufügen',
  'repeater.remove': '{label} entfernen',
  'repeater.removeRow': '{remove}, {position} von {count}',
  'repeater.moveUp': '{label} {position} von {count} nach oben verschieben',
  'repeater.moveDown': '{label} {position} von {count} nach unten verschieben',

  'tabs.unnamed': 'Registerkarte {position}',

  'options.unavailable':
    'Die Antworten dieses Felds kommen aus „{source}“, das diese Anwendung nicht bereitstellt.',
  'options.failed': 'Die Optionen konnten nicht geladen werden. Tippen Sie, um es erneut zu versuchen.',
  'options.failedListed':
    'Die Optionen konnten nicht geladen werden. Sie werden jedes Mal erneut angefragt, wenn Sie zu diesem Feld wechseln.',
  'options.tooShort': {
    one: 'Geben Sie mindestens {count} Zeichen ein, um zu suchen.',
    other: 'Geben Sie mindestens {count} Zeichen ein, um zu suchen.',
  },
  'options.searchOnly':
    'Die Antworten dieses Felds werden über eine Suche gefunden, die diese Liste nicht bietet.',
  'options.searching': 'Suche läuft…',
  'options.capped':
    'Die ersten {shown} von {total} werden angezeigt – tippen Sie weiter, um einzugrenzen.',
  'options.cappedListed': {
    one: 'Die erste von {total} wird angezeigt.',
    other: 'Die ersten {count} von {total} werden angezeigt.',
  },
  'options.more': {
    one: 'Die erste Option wird angezeigt; es gibt weitere – tippen Sie weiter, um einzugrenzen.',
    other: 'Die ersten {count} werden angezeigt; es gibt weitere – tippen Sie weiter, um einzugrenzen.',
  },
  'options.moreListed': {
    one: 'Die erste Option wird angezeigt; es gibt mehr, als diese Liste zeigen kann.',
    other: 'Die ersten {count} werden angezeigt; es gibt mehr, als diese Liste zeigen kann.',
  },
  'options.withheld': {
    one: 'Ein Treffer kann hier nicht ausgewählt werden.',
    other: '{count} Treffer können hier nicht ausgewählt werden.',
  },
  'options.noMatch': 'Keine passenden Optionen',
  'options.suggestions': 'Vorschläge für {label}',
  'tagpicker.chosen': '{label}: ausgewählt',
  'tagpicker.remove': '{option} entfernen',

  'ranking.order': '{label}: Ihre Reihenfolge',
  'ranking.pool': '{label}: noch nicht eingereiht',
  'ranking.up': '{option} nach oben verschieben',
  'ranking.down': '{option} nach unten verschieben',
  'ranking.remove': '{option} aus der Reihenfolge nehmen',
  'ranking.rank': '{option} einreihen',

  'file.unavailable':
    'Dieses Formular kann hier keine Dateien annehmen, weil kein Speicherort für Uploads eingerichtet ist.',
  'file.up': '{name}, {position} von {count}, nach oben verschieben',
  'file.down': '{name}, {position} von {count}, nach unten verschieben',
  'file.remove': '{name} entfernen',
  'file.undo': 'Entfernen von {name} rückgängig machen',
  'file.waiting': 'Wartet',
  'file.uploading': '{name} wird hochgeladen',
  'file.notAttached': 'Nicht angehängt: {reason}',
  'file.retry': '{name} erneut versuchen',
  'file.dismiss': '{name} verwerfen',
  'file.cancel': 'Hochladen von {name} abbrechen',
  'file.status.uploading': '{name} wird hochgeladen…',
  'file.status.failed': '{name} wurde nicht angehängt: {reason}',
  'file.status.failedSeveral': {
    one: '{count} Datei wurde nicht angehängt: {names}.',
    other: '{count} Dateien wurden nicht angehängt: {names}.',
  },

  'scanner.scan': 'Scannen',
  'scanner.scanning': 'Wird gescannt…',
  'scanner.noText':
    'Scannen hat nicht funktioniert: Der Scanner hat keinen Text geliefert. Geben Sie den Wert stattdessen ein.',
  'scanner.failed': 'Scannen hat nicht funktioniert: {reason}. Geben Sie den Wert stattdessen ein.',

  'richtext.toolbar': 'Formatierung für {label}',
  'richtext.strong': 'Fett',
  'richtext.emphasis': 'Kursiv',
  'richtext.link': 'Link',
  'richtext.bulletList': 'Aufzählung',
  'richtext.orderedList': 'Nummerierte Liste',
  'richtext.linkAddress': 'Adresse des Links',

  'signature.typed': 'Namen eingeben',
  'signature.clear': 'Löschen',

  'resume.heading': 'Dieses Formular hat sich geändert, während Sie weg waren',
  'resume.breaking.kept':
    'Es hat sich zu stark geändert, um Ihre Antworten zu übernehmen. Deshalb wird es so gezeigt, wie Sie es verlassen haben.',
  'resume.breaking.cannotSubmit': 'Es kann nicht abgeschickt werden.',
  'resume.breaking.restart': 'Wenn Sie neu beginnen, erhalten Sie das aktuelle Formular.',
  'resume.setAside': {
    one: 'Eine Frage ist nicht mehr in diesem Formular. Ihre Antwort darauf wird weiterhin mit den übrigen aufbewahrt und mit ihnen gesendet – sie wird hier nur nicht mehr angezeigt.',
    other:
      '{count} Fragen sind nicht mehr in diesem Formular. Ihre Antworten darauf werden weiterhin mit den übrigen aufbewahrt und mit ihnen gesendet – sie werden hier nur nicht mehr angezeigt.',
  },
} as const satisfies Record<FormWordId, Message>
