import type { Message } from './messages.js'
import type { DraftMessageId } from './messages-drafts.js'

/**
 * The drafting part's words in French, spread into `BUILDER_MESSAGES_FR`: complete, in the
 * polite imperative and with the no-break spaces the rest of the French uses, and in a file
 * of its own for the reason the English is
 * ([0162](../../../docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)).
 */
export const DRAFT_MESSAGES_FR = {
  'drafts.title': 'Faire rédiger des exemples par un modèle',
  'drafts.label': 'Que doit faire ce formulaire ? Avec vos propres mots',
  'drafts.example': 'La Suisse demande un canton, et nulle part ailleurs',
  'drafts.withheld':
    'Le modèle voit les champs de ce formulaire et vos mots, jamais ses règles : un exemple écrit à partir d’une règle lui donne raison, qu’elle soit juste ou non.',
  'drafts.write': 'Rédiger des exemples',
  'drafts.writing': 'Rédaction…',
  'drafts.stop': 'Arrêter la rédaction',
  'drafts.list': 'Exemples rédigés',
  'drafts.holds': 'Tient avec le formulaire tel qu’il est.',
  'drafts.fails':
    'Ne tient pas avec le formulaire tel qu’il est. Gardez-le si l’exemple est juste et le formulaire faux ; écartez-le si l’exemple est faux.',
  'drafts.keep': 'Garder {name}',
  'drafts.discard': 'Écarter {name}',
  'drafts.lastAnswer': 'Ce que le modèle a répondu en dernier',

  'drafts.status.writing': 'Rédaction des exemples, puis lecture.',
  'drafts.status.ready': {
    one: '{count} exemple rédigé. Aucun n’est gardé tant que vous ne le gardez pas.',
    other: '{count} exemples rédigés. Aucun n’est gardé tant que vous ne le gardez pas.',
  },
  'drafts.status.unusable': {
    one: '{count} élément de la réponse était inutilisable.',
    other: '{count} éléments de la réponse étaient inutilisables.',
  },
  'drafts.status.kept': '{name} gardé. Il figure maintenant dans la liste des scénarios.',
  'drafts.status.discarded': '{name} écarté.',
  'drafts.status.taken': 'Pas gardé : il existe déjà un scénario nommé {name}.',
  'drafts.status.unknownPath':
    'Pas gardé : {name} nomme un champ que ce formulaire n’a pas, et ne vérifierait rien.',
  'drafts.status.stopped': 'Arrêté. Rien n’a été rédigé.',
  'drafts.status.unreachable': 'Rien n’a été rédigé. Le modèle n’a pas pu être joint : {reason}',
  'drafts.status.unreachableNoReason': 'Rien n’a été rédigé. Le modèle n’a pas pu être joint.',
  'drafts.status.declined': 'Rien n’a été rédigé. Le modèle a refusé cette demande.',
  'drafts.status.failed': {
    one: 'Rien n’a été rédigé. {count} tentative, et la réponse ne contenait aucun exemple utilisable.',
    other: 'Rien n’a été rédigé. {count} tentatives, et aucune réponse ne contenait d’exemple utilisable.',
  },

  'drafts.problem.notJson': 'La dernière réponse ne contenait aucun objet JSON.',
  'drafts.problem.unexplained': 'La dernière réponse a refusé sans dire pourquoi.',
  'drafts.problem.noList': 'La dernière réponse ne contenait aucune liste d’exemples.',
  'drafts.problem.empty': 'La liste d’exemples de la dernière réponse était vide.',
  'drafts.item': 'Élément {position}',
  'drafts.reason.notAnObject': '{item} n’est pas un exemple du tout.',
  'drafts.reason.unknownKey':
    '{item} a « {part} », qu’un exemple n’a pas : il vérifierait moins qu’il ne le dit.',
  'drafts.reason.noName': '{item} n’a pas de nom.',
  'drafts.reason.nameTaken': '{item} : un scénario de ce nom existe déjà.',
  'drafts.reason.nameRepeated': '{item} : un exemple qui le précède dans la réponse porte le même nom.',
  'drafts.reason.noChanges': '{item} ne fixe aucune réponse.',
  'drafts.reason.noVerdict': '{item} ne dit pas si le formulaire doit être valide.',
  'drafts.reason.malformed': '{item} : son « {part} » n’est pas ce qu’un exemple contient à cet endroit.',
} as const satisfies Record<DraftMessageId, Message>
