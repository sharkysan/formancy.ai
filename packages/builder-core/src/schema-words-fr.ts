import type { SchemaWords } from './messages.js'

/**
 * The spec's own words — a property's title and description, a field type's name
 * and what it is for — in French. Keyed by the English the spec's JSON Schema
 * writes, for the reasons `schema-words-de.ts` gives
 * ([0121](../../../docs/decisions/0121-the-specs-words-are-translated-beside-it.md)).
 */
export const SCHEMA_WORDS_FR: SchemaWords = {
  Required: 'Obligatoire',
  'Whether the form can be sent without an answer to this field. Turning this on for a field that already exists invalidates the submissions that left it empty, so publishing reports it as a lossy change.':
    'Si le formulaire peut être envoyé sans réponse à ce champ. L’activer sur un champ existant invalide les envois qui l’ont laissé vide ; la publication le signale donc comme une modification avec perte.',
  'Clear when hidden': 'Effacer quand masqué',
  'What happens to an answer when a rule hides its field. On (the default), the answer is removed from the submission, so a hidden branch cannot carry data. Off, the answer is kept and comes back when the field reappears.':
    'Ce qui arrive à une réponse quand une règle masque son champ. Activé (par défaut) : la réponse est retirée de l’envoi, afin qu’une branche masquée ne transporte aucune donnée. Désactivé : la réponse est gardée et revient quand le champ réapparaît.',
  Label: 'Libellé',
  'What the person filling the form in reads next to this field, or a reference to it in the message catalogue.':
    'Ce que lit la personne qui remplit le formulaire à côté de ce champ, ou une référence vers ce texte dans le catalogue de messages.',
  'Minimum length': 'Longueur minimale',
  'The shortest answer that counts, in characters.': 'La réponse la plus courte acceptée, en caractères.',
  'Maximum length': 'Longueur maximale',
  'The longest answer that counts, in characters.': 'La réponse la plus longue acceptée, en caractères.',
  Pattern: 'Motif',
  'A regular expression the whole answer must match. Checked when the form is saved, so a broken or dangerous pattern never reaches a person filling the form in.':
    'Une expression régulière à laquelle toute la réponse doit correspondre. Vérifiée à l’enregistrement du formulaire, afin qu’un motif cassé ou dangereux n’atteigne jamais une personne qui le remplit.',
  Format: 'Format',
  'Input mask': 'Masque de saisie',
  'The shape the answer is typed into, one character per position: `9` takes a digit, `a` a letter and `*` either, and any other character is written by the control rather than typed — `(999) 999-9999`. A backslash makes the next character one the control writes: `\\9`. The answer holds only what was typed into the positions, so `(999) 999-9999` stores `5551234567`, and an answer that leaves a position empty is refused. Needs spec version 4.':
    'La forme dans laquelle la réponse est saisie, un caractère par position : `9` accepte un chiffre, `a` une lettre et `*` l’un ou l’autre, et tout autre caractère est écrit par le champ plutôt que saisi — `(999) 999-9999`. Une barre oblique inverse fait du caractère suivant un caractère écrit par le champ : `\\9`. La réponse ne contient que ce qui a été saisi dans les positions, donc `(999) 999-9999` enregistre `5551234567`, et une réponse qui laisse une position vide est refusée. Nécessite la version 4 de la spécification.',
  'A named shape the answer must have. A closed list on purpose: each entry is one well-tested check, not a per-form regular expression.':
    'Une forme nommée que la réponse doit avoir. Une liste fermée à dessein : chaque entrée est une vérification bien testée, pas une expression régulière propre à chaque formulaire.',
  Widget: 'Présentation',
  'How this field should look. Presentation only: it never changes what the field collects or what is stored. Leave it out for the default control. Offer a camera route to a value somebody could otherwise type, such as reading a QR code. The answer is still the same string, and typing it must stay possible.':
    'L’apparence de ce champ. Présentation seulement : cela ne change jamais ce que le champ recueille ni ce qui est enregistré. Laissez vide pour la commande par défaut. Propose de passer par la caméra pour une valeur qu’on pourrait sinon saisir, comme lire un QR code. La réponse reste la même chaîne, et la saisie doit rester possible.',
  Minimum: 'Minimum',
  'The smallest value that counts as a valid answer.': 'La plus petite valeur acceptée comme réponse valide.',
  Maximum: 'Maximum',
  'The largest value that counts as a valid answer.': 'La plus grande valeur acceptée comme réponse valide.',
  Step: 'Pas',
  'The granularity of the answer, and the distance a slider moves. Counted from the minimum when there is one, and from zero when there is not — so a step of 5 with a minimum of 2 accepts 2, 7 and 12. Must be greater than zero. Needs spec version 4.':
    'La finesse de la réponse, et la distance que parcourt un curseur. Compté à partir du minimum s’il y en a un, sinon à partir de zéro — un pas de 5 avec un minimum de 2 accepte donc 2, 7 et 12. Doit être supérieur à zéro. Demande la version 4 de la spécification.',
  'How this field should look. Presentation only: it never changes what the field collects or what is stored. Leave it out for the default control. Show a scale of stars or numbers between the minimum and the maximum, or a track to drag. The answer is unchanged: still one number, and still subject to the minimum, maximum and step. Needs spec version 4.':
    'L’apparence de ce champ. Présentation seulement : cela ne change jamais ce que le champ recueille ni ce qui est enregistré. Laissez vide pour la commande par défaut. Affiche une échelle d’étoiles ou de nombres entre le minimum et le maximum, ou une piste à faire glisser. La réponse ne change pas : toujours un nombre, toujours soumis au minimum, au maximum et au pas. Demande la version 4 de la spécification.',
  'How this field should look. Presentation only: it never changes what the field collects or what is stored. Leave it out for the default control. Show the tick-box as a switch. The answer is unchanged: still true, false, or untouched.':
    'L’apparence de ce champ. Présentation seulement : cela ne change jamais ce que le champ recueille ni ce qui est enregistré. Laissez vide pour la commande par défaut. Affiche la case à cocher comme un interrupteur. La réponse ne change pas : vrai, faux ou non touché.',
  Options: 'Choix',
  'The answers this field offers, in the order they appear.':
    'Les réponses que propose ce champ, dans l’ordre où elles apparaissent.',
  'How this field should look. Presentation only: it never changes what the field collects or what is stored. Leave it out for the default control. Let somebody type to narrow the options instead of scrolling them. The answer is still one of the options offered.':
    'L’apparence de ce champ. Présentation seulement : cela ne change jamais ce que le champ recueille ni ce qui est enregistré. Laissez vide pour la commande par défaut. Permet de taper pour réduire les choix au lieu de les faire défiler. La réponse reste l’un des choix proposés.',
  'Options source': 'Source des choix',
  "Where this field's answers come from, when there are too many to write into the form or they change too often. This is a NAME the deployment resolves to a list — never an address: the form never says where to look, so moving it between staging and production changes nothing here. The value that gets stored is a code only that source can decode, and a published version is frozen forever, so it has to still mean the same thing in a year. Leave it out and the field offers the options written above.":
    'D’où viennent les réponses de ce champ, quand il y en a trop pour les écrire dans le formulaire ou qu’elles changent trop souvent. C’est un NOM que le déploiement résout en liste — jamais une adresse : le formulaire ne dit jamais où chercher, le déplacer entre la recette et la production ne change donc rien ici. La valeur enregistrée est un code que seule cette source sait décoder, et une version publiée est figée pour toujours : il doit encore signifier la même chose dans un an. Laissez vide et le champ propose les choix écrits ci-dessus.',
  'Fewest choices': 'Choix minimum',
  'How many options must be ticked. Leave it unset to accept any number — and use `required` rather than a minimum of 1, so the reader is told the field is required before they touch it.':
    'Combien de choix doivent être cochés. Laissez vide pour accepter n’importe quel nombre — et utilisez `required` plutôt qu’un minimum de 1, afin que la personne sache que le champ est obligatoire avant d’y toucher.',
  'Most choices': 'Choix maximum',
  'How many options may be ticked at once.': 'Combien de choix peuvent être cochés à la fois.',
  'How this field should look. Presentation only: it never changes what the field collects. `tagpicker` narrows a long list by typing and shows the answers as chips; the answer is still an array of offered option values, in the options’ own order.':
    'L’apparence de ce champ. Présentation seulement : cela ne change jamais ce que le champ recueille. `tagpicker` réduit une longue liste par la saisie et affiche les réponses comme des étiquettes ; la réponse reste une liste de valeurs proposées, dans l’ordre des choix eux-mêmes.',
  'Earliest allowed': 'Valeur au plus tôt',
  'The earliest date this field accepts, inclusive, written exactly as an answer is: 2026-09-19. A fixed value, not an expression and not the current date — a bound that moved with the clock would let the same submission pass in the browser and fail on the server. For "must be in the future", write a rule.':
    'La date la plus ancienne que ce champ accepte, incluse, écrite exactement comme une réponse : 2026-09-19. Une valeur fixe, pas une expression ni la date du jour — une borne qui suivrait l’horloge laisserait le même envoi passer dans le navigateur et échouer sur le serveur. Pour « doit être dans le futur », écrivez une règle.',
  'Latest allowed': 'Valeur au plus tard',
  'The latest date this field accepts, inclusive, written exactly as an answer is: 2026-09-19. A fixed value, not an expression and not the current date — a bound that moved with the clock would let the same submission pass in the browser and fail on the server. For "must be in the future", write a rule.':
    'La date la plus tardive que ce champ accepte, incluse, écrite exactement comme une réponse : 2026-09-19. Une valeur fixe, pas une expression ni la date du jour — une borne qui suivrait l’horloge laisserait le même envoi passer dans le navigateur et échouer sur le serveur. Pour « doit être dans le futur », écrivez une règle.',
  'The earliest time this field accepts, inclusive, written exactly as an answer is: 09:30. A fixed value, not an expression and not the current time — a bound that moved with the clock would let the same submission pass in the browser and fail on the server. For "must be in the future", write a rule.':
    'L’heure la plus précoce que ce champ accepte, incluse, écrite exactement comme une réponse : 09:30. Une valeur fixe, pas une expression ni l’heure actuelle — une borne qui suivrait l’horloge laisserait le même envoi passer dans le navigateur et échouer sur le serveur. Pour « doit être dans le futur », écrivez une règle.',
  'The latest time this field accepts, inclusive, written exactly as an answer is: 09:30. A fixed value, not an expression and not the current time — a bound that moved with the clock would let the same submission pass in the browser and fail on the server. For "must be in the future", write a rule.':
    'L’heure la plus tardive que ce champ accepte, incluse, écrite exactement comme une réponse : 09:30. Une valeur fixe, pas une expression ni l’heure actuelle — une borne qui suivrait l’horloge laisserait le même envoi passer dans le navigateur et échouer sur le serveur. Pour « doit être dans le futur », écrivez une règle.',
  'The earliest date and time this field accepts, inclusive, written exactly as an answer is: 2026-09-19T08:00:00Z. A fixed value, not an expression and not the current date and time — a bound that moved with the clock would let the same submission pass in the browser and fail on the server. For "must be in the future", write a rule.':
    'L’instant le plus ancien que ce champ accepte, inclus, écrit exactement comme une réponse : 2026-09-19T08:00:00Z. Une valeur fixe, pas une expression ni l’instant présent — une borne qui suivrait l’horloge laisserait le même envoi passer dans le navigateur et échouer sur le serveur. Pour « doit être dans le futur », écrivez une règle.',
  'The latest date and time this field accepts, inclusive, written exactly as an answer is: 2026-09-19T08:00:00Z. A fixed value, not an expression and not the current date and time — a bound that moved with the clock would let the same submission pass in the browser and fail on the server. For "must be in the future", write a rule.':
    'L’instant le plus tardif que ce champ accepte, inclus, écrit exactement comme une réponse : 2026-09-19T08:00:00Z. Une valeur fixe, pas une expression ni l’instant présent — une borne qui suivrait l’horloge laisserait le même envoi passer dans le navigateur et échouer sur le serveur. Pour « doit être dans le futur », écrivez une règle.',
  'Accepted file types': 'Types de fichier acceptés',
  'Media types or extensions, such as `application/pdf` or `.png` — the same grammar the HTML `accept` attribute uses, so the file picker filters on exactly what the server then enforces. A filter in the browser alone is a suggestion, not a rule.':
    'Des types de média ou des extensions, comme `application/pdf` ou `.png` — la même syntaxe que l’attribut HTML `accept`, afin que le sélecteur de fichiers filtre exactement ce que le serveur impose ensuite. Un filtre dans le seul navigateur est une suggestion, pas une règle.',
  'Largest file': 'Fichier le plus volumineux',
  'The size limit for one file, in bytes. The server checks it as well, because the browser cannot be trusted to.':
    'La taille maximale d’un fichier, en octets. Le serveur la vérifie aussi, car on ne peut pas s’y fier côté navigateur.',
  'Fewest files': 'Fichiers minimum',
  'How many files must be attached.': 'Combien de fichiers doivent être joints.',
  'Most files': 'Fichiers maximum',
  'How many files may be attached.': 'Combien de fichiers peuvent être joints.',
  'Longest answer': 'Réponse la plus longue',
  'The cap on the answer, counted in characters of the stored markup rather than of the text a reader sees.':
    'La limite de la réponse, comptée en caractères du balisage enregistré plutôt que du texte que l’on voit.',
  'Signing box': 'Zone de signature',
  'The width and height the points are recorded in — a coordinate space, not pixels on anybody’s screen. It belongs to the field rather than to each answer, so two signatures on one form are comparable and a stored one can be redrawn at any size.':
    'La largeur et la hauteur dans lesquelles les points sont enregistrés — un espace de coordonnées, pas des pixels sur un écran. Elle appartient au champ et non à chaque réponse, afin que deux signatures d’un même formulaire soient comparables et qu’une signature enregistrée puisse être redessinée à n’importe quelle taille.',
  'Most points': 'Points maximum',
  'How many points one answer may carry across all its strokes. An unbounded point list is a payload amplifier, so this has a ceiling like everything else here.':
    'Combien de points une réponse peut contenir sur l’ensemble de ses traits. Une liste de points sans limite démultiplie le volume de données, elle a donc un plafond comme tout le reste ici.',
  'Minimum rows': 'Lignes minimum',
  'How many rows the form opens with and will not go below. A repeater that promises one row shows one empty row, not an add button and a shrug.':
    'Avec combien de lignes le formulaire s’ouvre, et en dessous de combien il ne descend pas. Une répétition qui promet une ligne affiche une ligne vide, pas un bouton d’ajout et un haussement d’épaules.',
  'Maximum rows': 'Lignes maximum',
  'How many rows a person may add.': 'Combien de lignes une personne peut ajouter.',
  'Add button label': 'Libellé du bouton d’ajout',
  'The accessible name of the control that adds a row.':
    'Le nom accessible de la commande qui ajoute une ligne.',
  'Remove button label': 'Libellé du bouton de suppression',
  "The accessible name of the control that removes a row. The renderer appends the row's position, so a screen reader user hears which row a button kills.":
    'Le nom accessible de la commande qui supprime une ligne. Le moteur de rendu y ajoute la position de la ligne, afin qu’une personne utilisant un lecteur d’écran entende quelle ligne un bouton supprime.',
  'How this field should look. Presentation only: it never changes what the field collects or what is stored. Leave it out for the default control. Show the rows as a table with aligned columns instead of stacked blocks. The answer is unchanged.':
    'L’apparence de ce champ. Présentation seulement : cela ne change jamais ce que le champ recueille ni ce qui est enregistré. Laissez vide pour la commande par défaut. Affiche les lignes comme un tableau aux colonnes alignées au lieu de blocs empilés. La réponse ne change pas.',
  Columns: 'Colonnes',
  "Which of this grid's fields become columns, and in what order. Leave it out to arrange every field in the order they are defined. A field left out is still collected and still shown, after the configured columns — a column list is an ordering, not a choice of which answers to keep.":
    'Quels champs de cette grille deviennent des colonnes, et dans quel ordre. Laissez vide pour disposer chaque champ dans l’ordre de sa définition. Un champ omis est toujours recueilli et toujours affiché, après les colonnes configurées — une liste de colonnes est un ordre, pas un choix des réponses à garder.',
  'Column span': 'Étendue de colonnes',
  'How many of the surrounding table\'s columns this takes. Only inside a table: elsewhere it is refused rather than ignored. Use "all" for the full width — it is what somebody means and it survives a change to the column count, where a number does not. Anything a person works inside rather than answers in a word — a rich text editor, a file dropzone, a long text area — usually wants the full width.':
    'Combien de colonnes du tableau englobant cet élément occupe. Seulement dans un tableau : ailleurs, c’est refusé plutôt qu’ignoré. Utilisez « all » pour toute la largeur — c’est ce que l’on veut dire, et cela survit à un changement du nombre de colonnes, contrairement à un nombre. Tout ce dans quoi on travaille plutôt que de répondre d’un mot — un éditeur de texte mis en forme, une zone de dépôt de fichiers, une longue zone de texte — veut en général toute la largeur.',
  Heading: 'Titre',
  'Optional heading for the group.': 'Titre facultatif du groupe.',
  'Name of the tab strip': 'Nom de la barre d’onglets',
  'Names the strip itself, not a tab. Two sets of tabs in one form are otherwise both announced as "tab list", and somebody using a screen reader cannot tell which is which.':
    'Nomme la barre elle-même, pas un onglet. Sinon, deux jeux d’onglets d’un même formulaire sont tous deux annoncés comme « liste d’onglets », et une personne utilisant un lecteur d’écran ne peut pas les distinguer.',
  'How many columns at full width. Narrower than that and it collapses to one, so the form still works at 320 pixels without sideways scrolling.':
    'Combien de colonnes en pleine largeur. Plus étroit, il se réduit à une seule, afin que le formulaire fonctionne encore à 320 pixels sans défilement horizontal.',
  'Optional heading for the grid.': 'Titre facultatif de la grille.',
  "What a reader is told this code IS. Required, because it is the code's accessible content: the picture is decoration a screen reader cannot use, and the value beneath it is a bare string — a booking reference announced with nothing to say what it is. Not the field's own label, which names the control somewhere else on the page.":
    'Ce que l’on dit à la personne que ce code EST. Obligatoire, car c’est le contenu accessible du code : l’image est une décoration inutilisable par un lecteur d’écran, et la valeur en dessous est une chaîne nue — une référence de réservation annoncée sans rien qui dise ce qu’elle est. Pas le libellé du champ lui-même, qui nomme la commande ailleurs sur la page.',
  'Single-line text': 'Texte sur une ligne',
  'One line of free text: a name, a reference, a short answer.':
    'Une ligne de texte libre : un nom, une référence, une réponse courte.',
  'Multi-line text': 'Texte sur plusieurs lignes',
  'A box several lines tall, for a message or a description.':
    'Une zone de plusieurs lignes, pour un message ou une description.',
  Number: 'Nombre',
  'A numeric answer, for amounts and counts. Do not use it for phone numbers, postcodes or account numbers: those lose their leading zeros.':
    'Une réponse numérique, pour des montants et des quantités. À ne pas utiliser pour des numéros de téléphone, des codes postaux ou des numéros de compte : ils perdent leurs zéros initiaux.',
  Checkbox: 'Case à cocher',
  'A single yes-or-no answer, such as accepting the terms.':
    'Une seule réponse oui ou non, comme l’acceptation des conditions.',
  Dropdown: 'Liste déroulante',
  'One answer picked from a list, shown collapsed. Best when the list is long.':
    'Une réponse choisie dans une liste, affichée repliée. Idéal pour une longue liste.',
  'Radio buttons': 'Boutons radio',
  'One answer picked from a list, with every option visible at once. Best for a handful of options.':
    'Une réponse choisie dans une liste, tous les choix visibles à la fois. Idéal pour une poignée de choix.',
  Date: 'Date',
  'A calendar date, with no time of day.': 'Une date du calendrier, sans heure.',
  'Hidden value': 'Valeur masquée',
  'Travels with the submission but is never shown to the reader, such as a campaign code or a referral source.':
    'Voyage avec l’envoi mais n’est jamais montrée à la personne, comme un code de campagne ou une source de recommandation.',
  'Static text': 'Texte fixe',
  'Text shown to the reader that collects nothing: a heading, an explanation, a notice.':
    'Un texte montré à la personne qui ne recueille rien : un titre, une explication, un avis.',
  Group: 'Groupe',
  'Related fields kept together on the same page. Collects nothing itself.':
    'Des champs liés, gardés ensemble sur la même page. Ne recueille rien lui-même.',
  Repeater: 'Répétition',
  'A set of fields the reader can fill in more than once, such as one block per passenger. A repeater cannot be placed inside another repeater in this version of the spec.':
    'Un ensemble de champs que l’on peut remplir plusieurs fois, comme un bloc par passager. Une répétition ne peut pas être placée dans une autre dans cette version de la spécification.',
  Checkboxes: 'Cases à cocher',
  'Several answers picked from a list, every option visible at once. The answer is the list of values chosen, so an option removed later leaves the submissions that chose it unchanged.':
    'Plusieurs réponses choisies dans une liste, tous les choix visibles à la fois. La réponse est la liste des valeurs choisies, afin qu’un choix retiré plus tard laisse inchangés les envois qui l’ont choisi.',
  Time: 'Heure',
  'A time of day, with no date and no time zone: opening hours, an appointment slot. Stored as "HH:MM" on a 24-hour clock, zero-padded, so that comparing two answers as text gives the same order as comparing them as times. Because it carries no zone it is not an instant and cannot be compared with the current time.':
    'Une heure de la journée, sans date ni fuseau horaire : des horaires d’ouverture, un créneau de rendez-vous. Enregistrée en « HH:MM » sur 24 heures, avec des zéros initiaux, afin que comparer deux réponses comme du texte donne le même ordre que les comparer comme des heures. Sans fuseau, ce n’est pas un instant et elle ne peut pas être comparée à l’heure actuelle.',
  'Date and time': 'Date et heure',
  'One moment in time, stored as "YYYY-MM-DDTHH:MM:SSZ" — always UTC, always with seconds. A reader types and reads it in their own zone; the answer records the instant. Numeric offsets are refused because "…10:00:00+03:00" sorts after "…08:00:00Z" as text while being earlier in fact, and the ordering is what makes an earliest or latest bound mean anything.':
    'Un instant, enregistré en « YYYY-MM-DDTHH:MM:SSZ » — toujours en UTC, toujours avec les secondes. On le saisit et on le lit dans son propre fuseau ; la réponse enregistre l’instant. Les décalages numériques sont refusés car « …10:00:00+03:00 » se trie après « …08:00:00Z » comme texte tout en étant plus tôt en réalité — et c’est l’ordre qui donne un sens à une borne au plus tôt ou au plus tard.',
  'File upload': 'Envoi de fichier',
  'One or more attached files. The submission stores what each file is and where it went — never its bytes — so a submission stays small and readable on its own.':
    'Un ou plusieurs fichiers joints. L’envoi enregistre ce qu’est chaque fichier et où il est allé — jamais ses octets —, afin qu’un envoi reste petit et lisible à lui seul.',
  'Formatted text': 'Texte mis en forme',
  'Several lines of text the reader can emphasise, link and list. Stored as a restricted markup, not as HTML: nothing a reader writes is ever parsed as markup by the renderer, which is what keeps a submitted answer from becoming a script on the page that displays it.':
    'Plusieurs lignes de texte que l’on peut mettre en valeur, lier et présenter en liste. Enregistré comme un balisage restreint, pas comme du HTML : rien de ce qu’on écrit n’est jamais interprété comme du balisage par le moteur de rendu — ce qui empêche une réponse envoyée de devenir un script sur la page qui l’affiche.',
  Signature: 'Signature',
  'A mark somebody draws, or their name typed. Stored as points rather than as a picture, so it scales, diffs and means something to a reader that is not a browser — and never as stroke timing, which is what would make it biometric data.':
    'Une marque que quelqu’un dessine, ou son nom saisi. Enregistrée comme des points plutôt que comme une image, afin qu’elle s’adapte à toute taille, se compare et ait un sens hors d’un navigateur — et jamais comme le rythme des traits, qui en ferait une donnée biométrique.',
}
