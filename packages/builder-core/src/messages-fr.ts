import type { BuilderMessageId, Message } from './messages.js'

/**
 * French, shipped and complete — for the same reason German is: a shipped
 * catalogue with a gap is a builder that is half French, which reads worse than
 * one that is all English. `messages.test.ts` fails when it has one.
 *
 * The register French software uses: the polite imperative ("Ajoutez",
 * "Déplacez") rather than "tu", which in French reads as familiarity rather than
 * plainness. A no-break space stands before `:` `;` `?` and inside « », as French
 * typography asks, so a line never breaks between a word and its mark.
 *
 * French counts 0 and 1 alike — "0 champ", "1 champ", "2 champs" — and
 * `Intl.PluralRules` knows it, which is why every count here is a plural message
 * rather than a test for 1 ([0114](../../../docs/decisions/0114-the-builder-speaks-the-authors-language.md)).
 */
export const BUILDER_MESSAGES_FR = {
  'tree.empty': 'Ce formulaire n’a pas encore de champs.',
  'tree.fieldCount': { one: '{count} champ', other: '{count} champs' },
  'palette.title': 'Ajouter un champ',

  'refuse.cannotOpen': 'Impossible d’ouvrir ce document dans le constructeur : {reasons}',
  'refuse.noContainer': 'Aucun conteneur à « {path} ».',
  'refuse.noField': 'Aucun champ à « {path} ».',
  'refuse.moveIntoItself':
    'Impossible de déplacer « {path} » à l’intérieur de lui-même ou de l’un de ses propres enfants.',
  'refuse.unwrapRenames':
    'Défaire « {where} » renomme chaque réponse qu’il contient — « {from} » devient « {to} » —, et {refused}',
  'refuse.renameFollows':
    'Renommer « {before} » en « {after} » oblige chaque règle qui le nomme à suivre, et {refused}',
  'refuse.noRule': 'Aucune règle à la position {index}.',
  'refuse.noLayout': 'Aucune disposition nommée « {name} ».',
  'refuse.crossLayout':
    'Impossible de déplacer entre les dispositions « {from} » et « {to} ». Retirez l’élément de l’une et placez-le dans l’autre.',
  'refuse.downgrade':
    'Ce formulaire est écrit pour la version {from} de la spécification et ne peut pas revenir à la {to} : ce que la version plus récente a ajouté n’aurait nulle part où aller, ce serait une perte de données plutôt qu’une modification.',
  'refuse.noLayoutNode': 'Rien à cette position dans la disposition « {layout} ».',
  'refuse.notAContainerNode':
    'Rien à cette position dans la disposition « {layout} » ne peut contenir d’autres éléments.',
  'refuse.unwrapLeaf':
    '« {where} » contient une seule réponse. Il n’y a rien à garder à l’intérieur, et défaire n’est pas un autre mot pour supprimer.',
  'refuse.unwrapRepeater':
    '« {where} » est une répétition, et les champs qu’elle contient décrivent une LIGNE, pas une liste de questions. Les sortir ferait des réponses de chaque ligne une seule réponse chacune et perdrait toutes les lignes après la première — sans que rien ne le dise, car le formulaire obtenu serait parfaitement valide. Déplacez les champs un par un si c’est ce que vous vouliez.',
  'proposal.stale':
    'Le formulaire a changé depuis cette proposition ; l’appliquer effacerait cette modification. Redemandez pour obtenir une proposition fondée sur le formulaire tel qu’il est maintenant.',
  'proposal.empty': 'Cette proposition ne change rien au formulaire.',
  'refuse.i18nNoneYet':
    'Ce formulaire n’a pas encore de traductions. Rendez d’abord un libellé traduisible.',
  'refuse.i18nNone': 'Ce formulaire n’a pas de traductions.',
  'refuse.fieldNodeHoldsNothing':
    'Un élément de champ place un seul champ. Il n’y a rien à garder à l’intérieur.',
  'refuse.wrapNeedsTwo':
    'Regrouper demande au moins deux éléments. Utilisez insertLayoutNode pour un seul.',
  'refuse.wrapperNotContainer':
    'L’enveloppe doit être un conteneur. Un élément de champ ne peut rien contenir.',
  'refuse.nodeListedTwice': 'Cet élément figure deux fois. Chacun ne peut entrer qu’une fois.',
  'refuse.wrapContainerWithChild':
    'Impossible de regrouper un conteneur avec un élément qu’il contient.',
  'refuse.moveNodeIntoItself':
    'Impossible de déplacer ceci à l’intérieur de lui-même ou de l’un de ses propres enfants.',
  'refuse.fieldNodeName': 'Un élément de champ prend son nom du champ qu’il place.',
  'refuse.notText':
    '« {property} » sur « {path} » n’est pas du texte : il n’y a donc rien à traduire.',
  'refuse.defaultLocale':
    '« {locale} » est la langue par défaut : toutes les autres s’y rabattent, et la retirer laisserait chaque message non traduit sans rien vers quoi se rabattre.',
  'refuse.notASetting':
    '« {property} » n’est pas un réglage. C’est ce qu’est l’élément, ou l’endroit où il se trouve, et ce sont les commandes de la disposition qui le changent.',
  'refuse.settingName':
    '« {property} » n’est pas autorisé comme nom de réglage d’un élément de disposition.',
  'translations.unreadable': 'Ce fichier n’a pas pu être lu : ce n’est pas du JSON.',
  'refuse.notACatalogue':
    'Ce n’est pas un fichier de traduction d’un constructeur formancy : il n’a ni langue ni liste de messages.',
  'refuse.ruleCannotFollow':
    'la règle {number} (« {kind} » sur « {target} ») ne peut pas suivre la modification : {reason} Modifiez ou supprimez d’abord la règle.',

  'layout.codeFor': 'Code de {name}',
  'layout.codeFor.inList': 'le code de {name}',
  'layout.named.section': 'Section « {label} »',
  'layout.named.row': 'Ligne « {label} »',
  'layout.named.column': 'Colonne « {label} »',
  'layout.named.tabs': 'Onglets « {label} »',
  'layout.named.table': 'Tableau « {label} »',
  'layout.empty.section': 'Section vide',
  'layout.empty.row': 'Ligne vide',
  'layout.empty.column': 'Colonne vide',
  'layout.empty.tabs': 'Onglets vides',
  'layout.empty.table': 'Tableau vide',
  'layout.with.section': 'Section avec {list}',
  'layout.with.row': 'Ligne avec {list}',
  'layout.with.column': 'Colonne avec {list}',
  'layout.with.tabs': 'Onglets avec {list}',
  'layout.with.table': 'Tableau avec {list}',
  'layout.inList.section': 'une section',
  'layout.inList.row': 'une ligne',
  'layout.inList.column': 'une colonne',
  'layout.inList.tabs': 'des onglets',
  'layout.inList.table': 'un tableau',
  'layout.inList.named.section': 'la section « {label} »',
  'layout.inList.named.row': 'la ligne « {label} »',
  'layout.inList.named.column': 'la colonne « {label} »',
  'layout.inList.named.tabs': 'les onglets « {label} »',
  'layout.inList.named.table': 'le tableau « {label} »',
  'layout.new.section': 'une section',
  'layout.new.row': 'une ligne',
  'layout.new.column': 'une colonne',
  'layout.new.tabs': 'des onglets',
  'layout.new.table': 'un tableau',
  'layout.new.qrcode': 'le code de {name}',

  'target.layout': 'la disposition « {layout} »',
  'target.firstField': '{where}, comme premier champ',
  'target.firstItem': '{where}, comme premier élément',
  'target.before': '{where}, avant {name}',
  'target.after': '{where}, après {name}',
  'target.between': '{where}, entre {before} et {after}',

  'tree.label': 'Structure du formulaire',
  'tree.addWhere': 'Où placer « {type} » ?',
  'tree.moveTitle': 'Déplacer {name}',
  'tree.locked': {
    one: '{types} demande une version plus récente de la spécification. Ce formulaire indique la version {version}.',
    other:
      '{types} demandent une version plus récente de la spécification. Ce formulaire indique la version {version}.',
  },
  'tree.upgrade': 'Passer à la version {version}',
  'dialog.cancel': 'Annuler',
  'palette.newPage': 'Page {number}',

  'keys.arrows.what': 'passer d’un champ à l’autre',
  'keys.add.what': 'ajouter un champ',
  'keys.addPage.what': 'ajouter une page, ce qui rend le formulaire multi-étapes',
  'keys.unwrap.what': 'défaire un conteneur et garder son contenu',
  'keys.move.what': 'déplacer le champ sélectionné',
  'keys.delete.key': 'Suppr',
  'keys.delete.what': 'le supprimer',
  'keys.undo.key': 'Ctrl+Z / Ctrl+Y',
  'keys.undo.what': 'annuler / rétablir',

  'said.undone': 'Annulé.',
  'said.nothingToUndo': 'Rien à annuler.',
  'said.redone': 'Rétabli.',
  'said.nothingToRedo': 'Rien à rétablir.',
  'said.nowhereToMove': '{name} ne peut être déplacé nulle part ailleurs.',
  'said.pageAdded': '{page} ajoutée.',
  'said.firstPageAdded': {
    one: '{page} ajoutée ; elle contient le champ qui était au premier niveau. Le formulaire est maintenant multi-étapes.',
    other:
      '{page} ajoutée ; elle contient les {count} champs qui étaient au premier niveau. Le formulaire est maintenant multi-étapes.',
  },
  'said.cannotAddPage': 'Impossible d’ajouter une page : {reason}',
  'said.unwrappedEmpty': '{name} était vide et a été retiré.',
  'said.unwrappedPage': {
    one: 'Page {name} retirée. Sa question est maintenant sur {host}.',
    other: 'Page {name} retirée. Ses {count} questions sont maintenant sur {host}.',
  },
  'said.unwrapped': {
    one: '{name} retiré ; la question qu’il contenait est restée.',
    other: '{name} retiré ; les {count} questions qu’il contenait sont restées.',
  },
  'said.notAWizard': '{said} Le formulaire n’est plus multi-étapes.',
  'said.cannotUnwrap': 'Impossible de défaire {name} : {reason}',
  'said.removed': '{name} supprimé.',
  'said.cannotRemove': 'Impossible de supprimer {name} : {reason}',
  'said.added': 'Ajouté : {what} — {where}.',
  'said.cannotAdd': 'Impossible d’ajouter : {reason}',
  'said.moved': '{name} déplacé : {where}.',
  'said.dropped': '{name} déplacé.',
  'said.cannotMove': 'Impossible de déplacer : {reason}',
  'said.upgraded':
    'Ce formulaire est maintenant en version {version} de la spécification. Rien d’autre n’a changé.',
  'said.cannotUpgrade': 'Impossible de mettre à niveau : {reason}',
  'said.alreadyNewest': 'il est déjà à la version la plus récente',

  'layout.label': 'Disposition',
  'layout.treeName': '{label} : {name}',
  'layout.none':
    'Ce formulaire n’a pas de disposition. Sans elle, les moteurs de rendu affichent chaque champ dans l’ordre du modèle, un par ligne — ce qui est un très bon formulaire. Ajoutez une disposition pour placer des champs côte à côte.',
  'layout.addLayout': 'Ajouter une disposition',
  'layout.placesNothing':
    'Cette disposition ne place encore rien ; le formulaire suit donc l’ordre du modèle.',
  'layout.unplaced': 'Absent de cette disposition',
  'layout.addTitle': 'Ajouter à la disposition',
  'layout.addWhere': 'Où placer {what} ?',
  'layout.codeWhich': 'Quelle réponse le code doit-il contenir ?',
  'layout.kind.row': 'Ligne',
  'layout.kind.column': 'Colonne',
  'layout.kind.section': 'Section',
  'layout.kind.qrcode': 'Code',
  'layout.hint.row':
    'Place son contenu côte à côte, et de nouveau en une seule colonne quand la largeur manque pour deux.',
  'layout.hint.column': 'Un côté d’une ligne.',
  'layout.hint.section': 'Un groupe nommé d’éléments, annoncé comme un seul.',
  'layout.hint.qrcode':
    'Un code scannable tiré d’une réponse. Ne recueille rien lui-même et affiche la réponse en texte à côté.',
  'layout.codeLocked':
    'Un code scannable demande la version {version} de la spécification. Ce formulaire indique la version {current}.',
  'layout.hint.unplaced': 'Placé nulle part pour l’instant.',
  'layout.newCode': '{name} en code',
  'layout.wrapTitle': 'Que placer à côté de {name} dans une ligne ?',
  'layout.wrapHelp':
    'Choisissez l’élément à placer à côté de {name}. Les deux vont dans une nouvelle ligne, {name} en premier.',
  'keys.layout.arrows.what': 'passer d’un élément à l’autre',
  'keys.layout.add.what': 'ajouter une ligne, une colonne, une section, un code ou un champ',
  'keys.layout.move.what': 'déplacer l’élément sélectionné',
  'keys.layout.unwrap.what': 'défaire une ligne ou une colonne en gardant son contenu',
  'keys.layout.wrap.what': 'le placer côte à côte avec un autre élément dans une ligne',
  'keys.layout.delete.what': 'le retirer de la disposition',
  'said.layoutAdded': 'Disposition « {name} » ajoutée.',
  'said.layoutUnwrapped': '{name} défait. Son contenu est resté où il était.',
  'said.layoutRemoved':
    '{name} retiré de la disposition. Le formulaire le recueille toujours.',
  'said.wrapped': '{first} et {second} sont maintenant côte à côte dans une ligne.',
  'said.cannotWrap': 'Impossible de regrouper : {reason}',
  'said.nothingBeside': 'Rien ne peut être placé à côté de {name}.',

  'options.heading': 'Choix',
  'options.empty': 'Aucun choix pour l’instant. Une liste déroulante sans choix ne peut pas recevoir de réponse.',
  'options.label': 'Libellé du choix',
  'options.value': 'Valeur enregistrée',
  'options.remove': 'Supprimer {name}',
  'options.add': 'Ajouter un choix',
  'options.newChoice': 'Nouveau choix',
  'options.image': 'Adresse de l’image',
  'options.imageAlt': 'Ce que montre l’image',
  'list.remove': 'Supprimer',
  'columns.heading': 'Colonnes',
  'columns.empty':
    'Aucune colonne configurée. Chaque réponse en reçoit quand même une, dans l’ordre où les champs sont déclarés.',
  'columns.answer': 'Réponse',
  'columns.noSuchField': '{name} — aucun champ de ce nom',
  'columns.width': 'Largeur, en proportion',
  'columns.align': 'Alignement',
  'columns.align.default': 'Par défaut',
  'columns.align.start': 'Début',
  'columns.align.center': 'Centre',
  'columns.align.end': 'Fin',
  'columns.header': 'Titre court',
  'columns.remove': 'Supprimer la colonne {name}',
  'columns.allNamed':
    'Chaque réponse a une colonne. Celles ci-dessus sont dimensionnées et ordonnées ; en retirer une remet sa réponse à la fin au lieu de la retirer du formulaire.',
  'columns.configure': 'Configurer la colonne {name}',
  'layoutProps.heading.field': 'Ce placement',
  'layoutProps.heading.qrcode': 'Ce code',
  'layoutProps.heading.section': 'Cette section',
  'layoutProps.heading.row': 'Cette ligne',
  'layoutProps.heading.column': 'Cette colonne',
  'layoutProps.heading.tabs': 'Cette barre d’onglets',
  'layoutProps.heading.table': 'Cette grille',

  'logic.heading': 'Règles',
  'logic.empty': 'Ce champ se comporte toujours de la même façon.',
  'logic.remove': 'Supprimer la règle « {rule} » sur {target}',
  'logic.add': 'Ajouter une règle',
  'logic.what': 'Ce que fait la règle',
  'logic.check': 'Quelle vérification',
  'logic.check.example': 'email-deja-utilise',
  'logic.calculation': 'Le calcul',
  'logic.calculation.example': 'quantite * prixUnitaire',
  'logic.match': 'Doivent être vraies',
  'logic.join.all': 'toutes ces conditions',
  'logic.join.any': 'au moins une de ces conditions',
  'logic.field': 'Champ',
  'logic.field.numbered': 'Champ {number}',
  'logic.comparison': 'Comparaison',
  'logic.comparison.numbered': 'Comparaison {number}',
  'logic.value': 'Valeur',
  'logic.value.numbered': 'Valeur {number}',
  'logic.removeComparison': 'Supprimer la comparaison {number}',
  'logic.addComparison': 'Ajouter une comparaison',
  // Not "Ajouter une règle" again: the draft's submit and the button that opens
  // the draft would otherwise share a name.
  'logic.addRule': 'Créer la règle',

  'said.movedTo': 'Déplacé : {where}.',

  'translations.orphaned':
    'Ces messages ne sont plus utilisés par le formulaire. Ils sont gardés plutôt que supprimés — un champ peut revenir, et une année de traductions ne devrait pas disparaître parce qu’une clé a changé.',
  'translations.none':
    'Rien dans ce formulaire n’est encore traduisible : ses mots sont écrits dans le document au lieu d’y être référencés. Les extraire garde ce qu’ils disent et permet d’ajouter une langue à côté.',
  'translations.extract': 'Rendre ce formulaire traduisible',
  'translations.language': 'Langue',
  'translations.default': '{locale} (par défaut)',
  'translations.new': 'Nouvelle langue',
  'translations.new.example': 'it',
  'translations.add': 'Ajouter la langue',
  'translations.download': 'Télécharger {locale}',
  'translations.upload': 'Importer un fichier traduit',
  'translations.written': {
    one: '{count} traduction écrite.',
    other: '{count} traductions écrites.',
  },
  'translations.unknown':
    'Non écrites, car ce formulaire ne les a plus — le fichier a été exporté avant qu’un champ soit retiré : {list}',
  'translations.stale':
    'Écrites, mais traduites d’un texte qui a changé depuis — à vérifier : {list}',
  'translations.missing': 'Non traduit',
  'translations.preview': 'Aperçu en {locale}',
  'translations.previewSubmit': 'Envoyer',

  'prompt.label': 'Décrivez le formulaire, ou la modification souhaitée',
  'prompt.example':
    'Un formulaire de contact avec une adresse e-mail et un message, et un numéro de téléphone seulement si la personne demande à être rappelée',
  'prompt.write': 'Rédiger',
  'prompt.writing': 'Rédaction…',
  'prompt.review': 'Examiner ces modifications',
  'prompt.review.costs':
    'Examiner ces modifications — certaines touchent des réponses déjà recueillies',
  'prompt.apply': 'Appliquer ces modifications',
  'prompt.discard': 'Abandonner',
  'prompt.lastAnswer': 'Ce que le modèle a répondu en dernier',
  'prompt.status.writing': 'Rédaction du formulaire et vérification.',
  'prompt.status.refused': 'Non appliqué. {reason}',
  'prompt.status.ready': {
    one: 'Prêt à examiner : {count} modification, qui ne touche aucune réponse déjà recueillie. Rien n’a été appliqué.',
    other:
      'Prêt à examiner : {count} modifications, dont aucune ne touche des réponses déjà recueillies. Rien n’a été appliqué.',
  },
  'prompt.status.readyCosts': {
    one: 'Prêt à examiner : {count} modification, et elle touche des réponses déjà recueillies. Rien n’a été appliqué.',
    other:
      'Prêt à examiner : {count} modifications, et certaines touchent des réponses déjà recueillies. Rien n’a été appliqué.',
  },
  'prompt.status.readyAfter': {
    one: 'Prêt à examiner après {attempts} tentatives : {count} modification, qui ne touche aucune réponse déjà recueillie. Rien n’a été appliqué.',
    other:
      'Prêt à examiner après {attempts} tentatives : {count} modifications, dont aucune ne touche des réponses déjà recueillies. Rien n’a été appliqué.',
  },
  'prompt.status.readyAfterCosts': {
    one: 'Prêt à examiner après {attempts} tentatives : {count} modification, et elle touche des réponses déjà recueillies. Rien n’a été appliqué.',
    other:
      'Prêt à examiner après {attempts} tentatives : {count} modifications, et certaines touchent des réponses déjà recueillies. Rien n’a été appliqué.',
  },
  'prompt.status.failed': {
    one: 'Rien n’a été appliqué. {count} tentative, et le document ne fonctionnait toujours pas.',
    other: 'Rien n’a été appliqué. {count} tentatives, et le document ne fonctionnait toujours pas.',
  },

  'scenarios.label': 'Scénarios',
  'scenarios.none': 'Aucun scénario.',
  'scenarios.empty':
    'Pas encore de scénario. Un scénario est un exemple dont la réponse est écrite — ce que ce formulaire doit faire d’un ensemble précis de réponses — et c’est la seule vérification capable de distinguer une condition qui fonctionne de la bonne.',
  'scenarios.stopped': 'Ne tient plus : {list}.',
  'scenarios.again': 'Tient de nouveau : {list}.',
  'scenarios.allHold': { one: 'Le scénario tient.', other: 'Les {count} scénarios tiennent.' },
  'scenarios.someFail': {
    one: '{count} sur {total} ne tient pas.',
    other: '{count} sur {total} ne tiennent pas.',
  },
  'scenarios.remove': 'Supprimer {name}',

  'palette.newField': 'Nouveau champ',
  'palette.firstOption': 'Premier choix',

  'rule.visible.label': 'Afficher ce champ quand',
  'rule.visible.hint':
    'Masqué sinon, et sa réponse est effacée sauf si le champ indique le contraire.',
  'rule.required.label': 'Exiger une réponse quand',
  'rule.required.hint': 'Seulement tant que la condition est vraie.',
  'rule.disabled.label': 'Désactiver ce champ quand',
  'rule.disabled.hint': 'Visible mais non modifiable.',
  'rule.validate.label': 'Refuser la réponse sauf si',
  'rule.validate.hint': 'La condition doit être vraie pour que le formulaire puisse être envoyé.',
  'rule.check.label': 'Interroger le déploiement sur la réponse',
  'rule.check.hint':
    'Nomme une vérification à laquelle ce déploiement répond — cette adresse e-mail est-elle déjà enregistrée, cette référence existe-t-elle. Une vérification que le déploiement ne fournit pas refuse la réponse au lieu de la laisser passer.',
  'rule.computed.label': 'Calculer ce champ comme',
  'rule.computed.hint':
    'Une expression CEL qui produit la réponse, recalculée dès que ce qu’elle lit change. Le champ est rempli plutôt que demandé, donc ce que la personne a saisi est remplacé.',
  'rule.skip.label': 'Sauter cette page quand',
  'rule.skip.hint':
    'La page est passée, dans les deux sens, et ses questions ne sont ni posées ni validées.',

  'operator.is': 'est',
  'operator.isNot': 'n’est pas',
  'operator.isMoreThan': 'est supérieur à',
  'operator.isLessThan': 'est inférieur à',
  'operator.isAnswered': 'a une réponse',
  'operator.isNotAnswered': 'n’a pas de réponse',
} as const satisfies Record<BuilderMessageId, Message>
