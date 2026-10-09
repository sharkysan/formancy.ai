import type { SchemaErrorSentences } from './messages.js'

/**
 * What the validator says, in French, by the code `@formancy/spec` gives each sentence.
 *
 * The same arrangement as the German beside it
 * ([0122](../../../docs/decisions/0122-a-validator-error-has-a-code.md)): the English
 * stays the spec's, every code is translated or this does not compile, and the
 * format's own words stay the words an author types. French typography as in the
 * builder's French catalogue — a non-breaking space inside « » and before : ; ? !
 */
export const SCHEMA_ERRORS_FR: SchemaErrorSentences = {
  // -------------------------------------------------------------- fields
  'repeater.nested':
    'Une répétition ne peut pas se trouver dans une autre répétition. Sortez-la de la répétition extérieure, ou faites-en un groupe.',
  'page.nested':
    'Une page ne peut se trouver qu’au premier niveau d’un formulaire. Sortez-la de « {key} », ou faites-en un groupe.',
  'grid.rowNotFlat':
    'Les lignes d’une grille sont plates, et « {key} » contient ses propres champs. Donnez à chacun de ces champs sa propre colonne, ou retirez la grille de cette répétition : ses lignes seront alors empilées.',
  'grid.columnUnknown':
    'Aucun champ de cette grille n’a la clé « {field} » : la colonne n’afficherait donc rien. Nommez l’un de ses propres champs.',
  'grid.columnTwice':
    'Deux colonnes affichent toutes deux « {field} ». Une réponse ne peut pas remplir deux colonnes.',
  'bounds.crossed':
    'La borne inférieure « {earliest} » vient après la borne supérieure « {latest} » : aucune réponse ne pourrait donc être acceptée. Inversez-les, ou supprimez-en une.',
  'key.taken':
    'Un autre champ utilise déjà la clé « {key} ». Une clé désigne une réponse : deux champs ne peuvent donc pas la partager.',
  'key.reserved':
    '« {key} » est réservé : c’est ainsi qu’une ligne de répétition porte son identité, si bien qu’aucun champ ne peut s’appeler ainsi.',
  'rename.self':
    'Ce champ indique avoir été renommé à partir de lui-même. Supprimez « renamedFrom », ou donnez-lui la clé que ce champ avait auparavant.',
  'rename.keyInUse':
    'La clé « {key} » est encore utilisée par un champ de ce formulaire : il s’agit donc d’une copie et non d’un renommage. Deux champs ne peuvent pas revendiquer les mêmes réponses.',
  'rename.claimed':
    'Un autre champ indique déjà avoir été renommé à partir de « {key} ». Les anciennes réponses ne peuvent aller qu’à un seul endroit.',
  'pattern.invalid': 'Ce n’est pas une expression régulière valide : {reason}.',
  'option.imageInDropdown':
    'Une liste déroulante ne peut pas afficher d’image : cette image ne serait donc jamais vue. Faites du champ un groupe de boutons radio, ou supprimez l’image.',
  'option.imageInChips':
    'Un sélecteur d’étiquettes affiche ses options sous forme de puces, qui ne peuvent pas afficher d’image : cette image ne serait donc jamais vue. Retirez le sélecteur d’étiquettes, ou supprimez l’image.',
  'ranking.duplicateOption':
    'Deux options de ce classement ont la valeur « {value} ». Un classement enregistre des valeurs : il ne pourrait pas dire laquelle des deux vient en premier — donnez à chaque option sa propre valeur.',
  'option.imageNotDrawn':
    'Un classement et une matrice affichent leurs options sans place pour une image : celle-ci ne serait jamais vue. Les images s’affichent sur les boutons radio et les cases à cocher ; retirez celle-ci.',
  'matrix.duplicateRow':
    'Deux lignes de cette matrice ont la valeur « {value} ». Une matrice enregistre chaque réponse sous sa ligne : elle ne pourrait pas dire quelle ligne a été répondue — donnez à chaque ligne sa propre valeur.',
  'matrix.duplicateColumn':
    'Deux colonnes de cette matrice ont la valeur « {value} ». Une matrice enregistre la colonne choisie : elle ne pourrait pas dire laquelle des deux — donnez à chaque colonne sa propre valeur.',
  'mask.noPositions':
    'Ce masque n’a aucune position où saisir : le champ ne pourrait recevoir aucune réponse. Utilisez 9 pour un chiffre, a pour une lettre ou * pour l’un ou l’autre.',

  // -------------------------------------------------------------- logic
  'rule.skipNoPages':
    'Une règle de saut fait passer une page, et ce formulaire n’a pas de pages. Ajoutez-lui d’abord un champ « page », ou supprimez la règle.',
  'rule.skipNotAPage':
    '« {target} » n’est pas une page. Une règle de saut nomme la clé d’une page — {pages} — plutôt qu’un chemin de données, car une page ne porte aucune réponse propre.',
  'rule.unknownTarget':
    'Aucun champ n’a le chemin de données « {target} ». Une règle ne peut s’appliquer qu’à un champ que le modèle définit.',
  'rule.runsOn':
    'Seule une règle « validate » ou « check » peut choisir où elle s’exécute. Une règle « {kind} » qui se comporterait différemment dans le navigateur et sur le serveur empêcherait le serveur de vérifier ce que le navigateur a fait.',
  'rule.duplicate':
    '« {target} » a déjà une règle « {kind} ». Un champ peut porter une règle par type, car deux n’auraient pas de gagnant défini.',

  // ------------------------------------------------------- translations
  'i18n.noDefaultCatalogue':
    'Il n’y a pas de catalogue « {locale} » : la langue vers laquelle tout se replie ne contient donc aucun mot.',
  'i18n.noSection':
    '« {id} » fait référence à une traduction, mais ce formulaire n’a pas de section « i18n ».',
  'i18n.unknownMessage': 'Aucun message nommé « {id} » dans le catalogue « {locale} ».',

  // ----------------------------------------------------------- layouts
  'layout.nameTaken':
    'Une autre disposition s’appelle déjà « {name} ». Une disposition est demandée par son nom : deux ne peuvent donc pas le partager.',
  'layout.spanOutsideTable':
    '« span » indique combien de colonnes d’un tableau occuper, et ce nœud n’est pas dans un tableau. Placez-le dans un nœud tableau, ou supprimez « span ».',
  'layout.spanTooWide':
    'Ceci occupe {span} colonnes dans un tableau qui en a {columns}. Utilisez « all » pour toute la largeur, afin que cela reste juste si le nombre de colonnes change.',
  'layout.codeUnknownPath':
    'Aucun champ n’a le chemin de données « {path} » : ce code n’encoderait donc rien.',
  'layout.codeNeedsLabel':
    'Ce code a besoin d’un libellé qui dise ce qu’il est. L’image ne peut pas être lue à voix haute et la valeur en dessous est une simple chaîne : le libellé est donc la seule chose sur laquelle un lecteur d’écran peut s’appuyer.',
  'layout.unknownPath':
    'Aucun champ n’a le chemin de données « {path} » : cette disposition ne place donc rien ici.',
  'layout.placedTwice':
    '« {path} » est déjà placé dans la disposition « {layout} ». Un champ a une seule place dans un agencement.',
  'layout.tabNotSection':
    'Un nœud d’onglets contient des sections, une par onglet, et celui-ci contient un « {kind} ». Placez-le dans une section et donnez un libellé à la section — ce libellé est le nom de l’onglet.',
  'layout.tabUnnamed':
    'Cet onglet n’a pas de nom : personne ne peut donc savoir ce qu’il contient. Donnez un libellé à la section.',
  'layout.tabsEmpty': 'Un nœud d’onglets sans onglet n’affiche rien du tout.',
  'layout.columnsWhole': 'Le nombre de colonnes d’un tableau doit être un nombre entier.',

  // ----------------------------------------------- spec versions
  'version.widget':
    'La présentation « {widget} » nécessite specVersion « {version} ». Ce document indique « {declared} ». Passez-le à « {version} » — tout ce qui se trouve déjà dans le document continue de fonctionner, car une version ultérieure ne fait qu’ajouter.',
  'version.bound':
    'Une borne « {bound} » nécessite specVersion « {version} ». Ce document indique « {declared} ». Passez-le à « {version} » — tout ce qui se trouve déjà dans le document continue de fonctionner, car une version ultérieure ne fait qu’ajouter.',
  'version.property':
    'Un « {property} » nécessite specVersion « {version} ». Ce document indique « {declared} ». Passez-le à « {version} » — tout ce qui se trouve déjà dans le document continue de fonctionner, car une version ultérieure ne fait qu’ajouter.',
  'version.step':
    'Un « step » nécessite specVersion « {version} ». Ce document indique « {declared} ». Passez-le à « {version} » — tout ce qui se trouve déjà dans le document continue de fonctionner, car une version ultérieure ne fait qu’ajouter.',
  'version.mask':
    'Un « mask » nécessite specVersion « {version} ». Ce document indique « {declared} ». Passez-le à « {version} » — tout ce qui se trouve déjà dans le document continue de fonctionner, car une version ultérieure ne fait qu’ajouter.',
  'version.optionImage':
    'L’image d’une option nécessite specVersion « {version} ». Ce document indique « {declared} ». Passez-le à « {version} » — tout ce qui se trouve déjà dans le document continue de fonctionner, car une version ultérieure ne fait qu’ajouter.',
  'version.optionsSource':
    'Une « optionsSource » nécessite specVersion « {version} ». Ce document indique « {declared} ». Passez-le à « {version} » — tout ce qui se trouve déjà dans le document continue de fonctionner, car une version ultérieure ne fait qu’ajouter.',
  'version.fieldType':
    'Un champ « {type} » nécessite specVersion « {version} ». Ce document indique « {declared} ». Passez-le à « {version} » — tout ce qui se trouve déjà dans le document continue de fonctionner, car une version ultérieure ne fait qu’ajouter.',
  'version.ruleKind':
    'Une règle « {kind} » nécessite specVersion « {version} ». Ce document indique « {declared} ». Passez-le à « {version} » — tout ce qui se trouve déjà dans le document continue de fonctionner, car une version ultérieure ne fait qu’ajouter.',
  'version.layoutKind':
    'Un nœud de disposition « {kind} » nécessite specVersion « {version} ». Ce document indique « {declared} ». Passez-le à « {version} » — tout ce qui se trouve déjà dans le document continue de fonctionner, car une version ultérieure ne fait qu’ajouter.',

  // ------------------------------------- the shape, as the JSON Schema checks it
  'options.twoSources':
    'Ce champ énumère ses choix et nomme en même temps une source pour eux, et aucune règle ne dit laquelle l’emporte. Gardez la liste, ou gardez la source et supprimez la liste.',
  'shape.notAllowed': 'Ceci n’est pas autorisé ici.',
  'shape.object': 'Doit être un objet.',
  'shape.array': 'Doit être une liste.',
  'shape.string': 'Doit être du texte.',
  'shape.number': 'Doit être un nombre.',
  'shape.integer': 'Doit être un nombre entier.',
  'shape.boolean': 'Doit être true ou false.',
  'shape.null': 'Doit être null.',
  'shape.type': 'Doit être de type {type}.',
  'shape.required': 'La propriété obligatoire « {property} » est absente.',
  'shape.childFields':
    'Seuls les groupes, les pages et les répétitions peuvent contenir des champs.',
  'shape.unknownProperty':
    'Propriété inconnue « {property} ». Vérifiez l’orthographe, ou supprimez-la.',
  'shape.const': 'Doit être {value}.',
  'shape.notOneOf': '{found} ne fait pas partie des valeurs autorisées : {allowed}.',
  'shape.fieldKey':
    '{found} n’est pas une clé de champ utilisable. Commencez par une lettre ou un trait de soulignement, puis n’utilisez que des lettres, des chiffres et des traits de soulignement.',
  'shape.formId':
    '{found} n’est pas un identifiant de formulaire utilisable. Commencez par une lettre ou un chiffre, puis n’utilisez que des lettres, des chiffres, des points, des tirets et des traits de soulignement.',
  'shape.checkName':
    '{found} n’est pas un nom de vérification utilisable. Nommez la vérification et laissez le déploiement dire où la demander — une adresse ici serait un détail de déploiement figé dans un formulaire publié, et un moyen de faire récupérer quelque chose à un serveur situé dans un réseau privé.',
  'shape.imageSource':
    '{found} n’est pas une adresse d’image utilisable par ce formulaire. Utilisez une adresse https://, un chemin commençant par / sur le site qui affiche le formulaire, ou une adresse data:image/ — pas http://, qu’une page sécurisée bloque.',
  'shape.pattern': '{found} ne correspond pas au motif exigé {pattern}.',
  'shape.maxLength': 'Doit compter {limit} caractères au plus.',
  'shape.empty': 'Ne doit pas être vide.',
  'shape.minLength': 'Doit compter au moins {limit} caractères.',
  // ajv's own wording, which no translation reaches: see the English.
  'shape.other': '{detail}',
}
