import type { FormWordId, Message } from './words.js'

/**
 * French, shipped and complete — for the reason German is.
 *
 * Addressed to somebody filling in a form, so "vous" and the polite imperative
 * ("Tapez", "Saisissez"). A no-break space stands before `:` `;` and inside « », as French
 * typography asks, so a line never breaks between a word and its mark — the convention the
 * builder's French keeps too.
 *
 * French counts 0 like 1 — "0 problème", "1 problème", "2 problèmes" — and
 * `Intl.PluralRules` knows it, which is why every count is a plural message.
 */
export const FORM_WORDS_FR = {
  'form.submit': 'Envoyer',
  'form.next': 'Suivant',
  'form.back': 'Précédent',
  'form.progress': 'Progression',
  'form.required': 'obligatoire',

  'errors.heading': {
    one: 'Il y a {count} problème à corriger',
    other: 'Il y a {count} problèmes à corriger',
  },
  'errors.entry': '{label} : {codes}',

  'repeater.add': 'Ajouter {label}',
  'repeater.remove': 'Supprimer {label}',
  'repeater.removeRow': '{remove}, {position} sur {count}',
  'repeater.moveUp': 'Monter {label} {position} sur {count}',
  'repeater.moveDown': 'Descendre {label} {position} sur {count}',

  'tabs.unnamed': 'Onglet {position}',

  'options.unavailable':
    'Les réponses de ce champ proviennent de « {source} », que cette application ne fournit pas.',
  'options.failed': 'Les options n’ont pas pu être chargées. Tapez pour réessayer.',
  'options.tooShort': {
    one: 'Tapez au moins {count} caractère pour rechercher.',
    other: 'Tapez au moins {count} caractères pour rechercher.',
  },
  'options.searching': 'Recherche…',
  'options.capped': 'Affichage des {shown} premiers sur {total} — continuez à taper pour affiner.',
  'options.noMatch': 'Aucune option ne correspond',
  'options.suggestions': 'Suggestions pour {label}',
  'tagpicker.chosen': '{label} : choisis',
  'tagpicker.remove': 'Retirer {option}',

  'ranking.order': '{label} : votre ordre',
  'ranking.pool': '{label} : pas encore classés',
  'ranking.up': 'Monter {option}',
  'ranking.down': 'Descendre {option}',
  'ranking.remove': 'Retirer {option} du classement',
  'ranking.rank': 'Classer {option}',

  'file.unavailable':
    'Ce formulaire ne peut pas accepter de fichiers ici, car aucune destination de téléversement n’a été configurée.',
  'file.up': 'Monter {name}, {position} sur {count}',
  'file.down': 'Descendre {name}, {position} sur {count}',
  'file.remove': 'Retirer {name}',
  'file.undo': 'Annuler le retrait de {name}',
  'file.waiting': 'En attente',
  'file.uploading': 'Téléversement de {name}',
  'file.notAttached': 'Non joint : {reason}',
  'file.retry': 'Réessayer {name}',
  'file.dismiss': 'Écarter {name}',
  'file.cancel': 'Annuler le téléversement de {name}',
  'file.status.uploading': 'Téléversement de {name}…',
  'file.status.failed': '{name} n’a pas été joint : {reason}',
  'file.status.failedSeveral': {
    one: '{count} fichier n’a pas été joint : {names}.',
    other: '{count} fichiers n’ont pas été joints : {names}.',
  },

  'scanner.scan': 'Scanner',
  'scanner.scanning': 'Scan en cours…',
  'scanner.noText':
    'Le scan n’a pas fonctionné : le scanner n’a pas renvoyé de texte. Saisissez plutôt la valeur.',
  'scanner.failed': 'Le scan n’a pas fonctionné : {reason}. Saisissez plutôt la valeur.',

  'richtext.toolbar': 'Mise en forme de {label}',
  'richtext.toolbarUnnamed': 'Mise en forme',
  'richtext.strong': 'Gras',
  'richtext.emphasis': 'Italique',
  'richtext.link': 'Lien',
  'richtext.bulletList': 'Liste à puces',
  'richtext.orderedList': 'Liste numérotée',
  'richtext.linkAddress': 'Adresse du lien',

  'signature.typed': 'Tapez votre nom',
  'signature.clear': 'Effacer',

  'resume.heading': 'Ce formulaire a changé pendant votre absence',
  'resume.breaking.kept':
    'Il a trop changé pour que vos réponses soient reprises ; il est donc affiché tel que vous l’avez laissé.',
  'resume.breaking.cannotSubmit': 'Il ne peut pas être envoyé.',
  'resume.breaking.restart': 'Recommencer vous donnera le formulaire actuel.',
  'resume.setAside': {
    one: '{count} question n’est plus dans ce formulaire. Votre réponse est toujours conservée avec les autres et sera envoyée avec elles — elle n’est simplement plus affichée ici.',
    other:
      '{count} questions ne sont plus dans ce formulaire. Vos réponses sont toujours conservées avec les autres et seront envoyées avec elles — elles ne sont simplement plus affichées ici.',
  },
} as const satisfies Record<FormWordId, Message>
