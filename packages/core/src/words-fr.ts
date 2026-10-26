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
  'errors.entry': '{label} : {problems}',

  'error.required': 'Cette question attend une réponse.',
  'error.required.checkbox': 'Cochez cette case pour continuer.',
  'error.required.rows': 'Ajoutez au moins une ligne.',
  'error.required.files': 'Joignez un fichier.',
  'error.invalid': "Cette réponse n'est pas acceptée.",
  'error.check_unavailable': "Cette réponse n'a pas pu être vérifiée pour l'instant. Réessayez dans un moment.",
  'error.type': 'Ce type de réponse ne convient pas à cette question.',
  'error.option': "Choisissez l'une des options proposées.",
  'error.duplicate': 'Classez chaque option une seule fois.',
  'error.row': 'Répondez seulement aux lignes que pose cette question.',
  'error.min': 'Saisissez {min} ou plus.',
  'error.max': 'Saisissez {max} ou moins.',
  'error.step': 'Saisissez une valeur par pas de {step}.',
  'error.minLength': { one: 'Saisissez au moins {count} caractère.', other: 'Saisissez au moins {count} caractères.' },
  'error.maxLength': { one: 'Saisissez au plus {count} caractère.', other: 'Saisissez au plus {count} caractères.' },
  'error.pattern': 'Saisissez la réponse sous la forme demandée.',
  'error.mask': "Remplissez chaque position du format affiché avec ce qu'elle attend.",
  'error.email': 'Saisissez une adresse e-mail, par exemple nom@example.com.',
  'error.url': 'Saisissez une adresse web commençant par https:// ou http://.',
  'error.uuid': 'Saisissez un identifiant de 32 chiffres hexadécimaux en cinq groupes.',
  'error.shape': 'Saisissez la réponse sous la forme {format}.',
  'error.earliest': 'Au plus tôt : {earliest}.',
  'error.latest': 'Au plus tard : {latest}.',
  'error.minItems.choices': { one: 'Choisissez-en au moins {count}.', other: 'Choisissez-en au moins {count}.' },
  'error.maxItems.choices': { one: 'Choisissez-en au plus {count}.', other: 'Choisissez-en au plus {count}.' },
  'error.minItems.files': { one: 'Joignez au moins {count} fichier.', other: 'Joignez au moins {count} fichiers.' },
  'error.maxItems.files': { one: 'Joignez au plus {count} fichier.', other: 'Joignez au plus {count} fichiers.' },
  'error.minItems.rows': { one: 'Ajoutez au moins {count} ligne.', other: 'Ajoutez au moins {count} lignes.' },
  'error.maxItems.rows': { one: 'Ajoutez au plus {count} ligne.', other: 'Ajoutez au plus {count} lignes.' },
  'error.maxFileSize': 'Un fichier peut faire au plus {maxFileSize}.',
  'error.accept': "Joignez un fichier de l'un de ces types : {accept}.",
  'error.box': 'La signature dépasse de son cadre. Effacez-la et signez à nouveau.',
  'error.maxPoints': 'La signature est trop détaillée pour être conservée. Effacez-la et signez à nouveau.',

  'answer.yes': 'Oui',
  'answer.no': 'Non',
  'answer.drawnSignature': 'Une signature dessinée',
  'answer.row': '{label} {position}',

  'repeater.add': 'Ajouter {label}',
  'repeater.remove': 'Supprimer {label}',
  'repeater.removeRow': '{remove}, {position} sur {count}',
  'repeater.moveUp': 'Monter {label} {position} sur {count}',
  'repeater.moveDown': 'Descendre {label} {position} sur {count}',

  'tabs.unnamed': 'Onglet {position}',

  'options.unavailable':
    'Les réponses de ce champ proviennent de « {source} », que cette application ne fournit pas.',
  'options.failed': 'Les options n’ont pas pu être chargées. Tapez pour réessayer.',
  'options.failedListed':
    'Les options n’ont pas pu être chargées. Elles sont redemandées chaque fois que vous revenez à ce champ.',
  'options.tooShort': {
    one: 'Tapez au moins {count} caractère pour rechercher.',
    other: 'Tapez au moins {count} caractères pour rechercher.',
  },
  'options.searchOnly':
    'Les réponses de ce champ se trouvent par une recherche, que cette liste ne permet pas.',
  'options.searching': 'Recherche…',
  'options.capped': 'Affichage des {shown} premiers sur {total} — continuez à taper pour affiner.',
  'options.cappedListed': {
    one: 'Affichage du premier sur {total}.',
    other: 'Affichage des {count} premiers sur {total}.',
  },
  // `one` is 0 as well as 1, and a page that goes on may hand over none (every row of it
  // withheld), so these two say the number rather than "le premier".
  'options.more': {
    one: 'Affichage de {count} option ; il y en a d’autres — continuez à taper pour affiner.',
    other: 'Affichage des {count} premiers ; il y en a d’autres — continuez à taper pour affiner.',
  },
  'options.moreListed': {
    one: 'Affichage de {count} option ; il y en a plus que cette liste ne peut en afficher.',
    other: 'Affichage des {count} premiers ; il y en a plus que cette liste ne peut en afficher.',
  },
  'options.withheld': {
    one: 'Un résultat ne peut pas être choisi ici.',
    other: '{count} résultats ne peuvent pas être choisis ici.',
  },
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
