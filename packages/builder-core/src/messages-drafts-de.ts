import type { Message } from './messages.js'
import type { DraftMessageId } from './messages-drafts.js'

/**
 * The drafting part's words in German, spread into `BUILDER_MESSAGES_DE`: complete, in
 * the informal register the rest of the German uses, and in a file of its own for the
 * reason the English is ([0162](../../../docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).
 */
export const DRAFT_MESSAGES_DE = {
  'drafts.title': 'Beispiele von einem Modell entwerfen lassen',
  'drafts.label': 'Was soll dieses Formular tun? In deinen eigenen Worten',
  'drafts.example': 'Bei der Schweiz wird nach dem Kanton gefragt, sonst nirgends',
  'drafts.withheld':
    'Das Modell sieht die Felder dieses Formulars und deine Worte, nie seine Regeln: Ein Beispiel, das aus einer Regel geschrieben ist, gibt ihr recht, ob sie stimmt oder nicht.',
  'drafts.write': 'Beispiele entwerfen',
  'drafts.writing': 'Entwirft…',
  'drafts.stop': 'Entwurf anhalten',
  'drafts.list': 'Entworfene Beispiele',
  'drafts.holds': 'Gilt für das Formular, wie es jetzt ist.',
  'drafts.fails':
    'Gilt nicht für das Formular, wie es jetzt ist. Behalte es, wenn das Beispiel stimmt und das Formular falsch ist; verwirf es, wenn das Beispiel falsch ist.',
  'drafts.keep': '{name} behalten',
  'drafts.discard': '{name} verwerfen',
  'drafts.lastAnswer': 'Was das Modell zuletzt geantwortet hat',

  'drafts.status.writing': 'Beispiele werden entworfen und gelesen.',
  'drafts.status.ready': {
    one: '{count} Beispiel entworfen. Keines wird behalten, bevor du es behältst.',
    other: '{count} Beispiele entworfen. Keines wird behalten, bevor du es behältst.',
  },
  'drafts.status.unusable': {
    one: '{count} Eintrag der Antwort war nicht verwendbar.',
    other: '{count} Einträge der Antwort waren nicht verwendbar.',
  },
  'drafts.status.kept': '{name} behalten. Es steht jetzt in der Liste der Szenarien.',
  'drafts.status.discarded': '{name} verworfen.',
  'drafts.status.taken': 'Nicht behalten: Es gibt schon ein Szenario namens {name}.',
  'drafts.status.unknownPath':
    'Nicht behalten: {name} nennt ein Feld, das dieses Formular nicht hat, und würde nichts prüfen.',
  'drafts.status.stopped': 'Angehalten. Nichts wurde entworfen.',
  'drafts.status.unreachable': 'Nichts wurde entworfen. Das Modell war nicht erreichbar: {reason}',
  'drafts.status.unreachableNoReason': 'Nichts wurde entworfen. Das Modell war nicht erreichbar.',
  'drafts.status.busy':
    'Nichts wurde entworfen. Eine andere Anfrage wartet noch auf die Antwort des Modells: Schließe sie zuerst ab oder halte sie an.',
  'drafts.status.declined': 'Nichts wurde entworfen. Das Modell hat diese Anfrage abgelehnt.',
  'drafts.status.failed': {
    one: 'Nichts wurde entworfen. {count} Versuch, und die Antwort enthielt kein verwendbares Beispiel.',
    other: 'Nichts wurde entworfen. {count} Versuche, und keine Antwort enthielt ein verwendbares Beispiel.',
  },

  'drafts.problem.notJson': 'Die letzte Antwort enthielt kein JSON-Objekt.',
  'drafts.problem.unexplained': 'Die letzte Antwort lehnte ab, ohne zu sagen, warum.',
  'drafts.problem.noList': 'Die letzte Antwort enthielt keine Liste von Beispielen.',
  'drafts.problem.empty': 'Die Liste von Beispielen in der letzten Antwort war leer.',
  'drafts.item': 'Eintrag {position}',
  'drafts.reason.notAnObject': '{item} ist gar kein Beispiel.',
  'drafts.reason.unknownKey':
    '{item} hat „{part}“, was ein Beispiel nicht hat, und würde weniger prüfen, als es sagt.',
  'drafts.reason.noName': '{item} hat keinen Namen.',
  'drafts.reason.nameTaken': '{item}: Ein Szenario mit diesem Namen gibt es schon.',
  'drafts.reason.nameRepeated': '{item}: Ein Beispiel davor in der Antwort hat denselben Namen.',
  'drafts.reason.noChanges': '{item} setzt keine Antworten.',
  'drafts.reason.noVerdict': '{item} sagt nicht, ob das Formular gültig sein soll.',
  'drafts.reason.malformed': '{item}: Sein „{part}“ ist nicht, was ein Beispiel dort enthält.',
} as const satisfies Record<DraftMessageId, Message>
