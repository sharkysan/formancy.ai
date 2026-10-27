import { FORM_WORDS_DE } from './words-de.js'
import { FORM_WORDS_FR } from './words-fr.js'

export { errorSentence } from './error-words.js'
export { countSentence } from './count-words.js'
export { answersInWords } from './answers-in-words.js'
export type { SaidAnswer } from './answers-in-words.js'

/**
 * The renderers' own words: what a form says that its author did not write.
 *
 * A form's questions are the author's, read through the document's catalogue in the
 * engine's locale ([0107](../../../docs/decisions/0107-layout-text-is-read-in-the-engines-locale.md)).
 * Around them every renderer draws words of its own — Next, Back, Submit, a row's
 * buttons, the error summary's heading, what a live region announces while a file is
 * sent. Those were English literals in each binding, React, Angular and Material apart,
 * so a form in German asked its questions in German around English buttons, and each new
 * control added more of them.
 *
 * **One catalogue, read in the language the questions are, which both renderers draw**
 * ([0171](../../../docs/decisions/0171-the-renderers-words-are-the-forms-language.md)):
 * the engine's locale where the document has a catalogue for it, and its default where not.
 * The renderer analogue of the builders' catalogue
 * ([0114](../../../docs/decisions/0114-the-builder-speaks-the-authors-language.md)), with
 * one difference that is the point: a builder is handed its language by the host, and a
 * form takes the language the reader chose for it. A host that builds a German engine has
 * already said which language the buttons are in, and asking it to say so twice is how
 * the buttons stayed English.
 *
 * **An entry point of `@formancy/core`, not its barrel.** Every renderer reads it and the
 * engine never does: the server imports the engine and has no buttons. As
 * `@formancy/core/words` it is its own module, so the engine's bundle does not carry
 * three languages of button labels, and nothing here imports the engine.
 *
 * **What this is not**: the document's catalogue, which is the author's and published with
 * the form; the engine's error codes, which stay the engine's vocabulary and the API's —
 * what a person reads for one is a word here, `errorSentence` (0191); and the builders'
 * words, which are for the person building.
 *
 * Placeholders are `{name}` and stay visible when a value is missing. A count is a plural
 * message keyed by `Intl.PluralRules` category, so the language chooses the form rather
 * than an `=== 1`.
 */

/** The forms a counted message takes, by `Intl.PluralRules` category. */
export interface PluralMessage {
  readonly zero?: string
  readonly one?: string
  readonly two?: string
  readonly few?: string
  readonly many?: string
  readonly other: string
}

export type Message = string | PluralMessage

/**
 * English, which every other language translates and which a message any language lacks
 * is said in. Grouped by where the words appear, so a translator meets a control's words
 * together.
 */
export const FORM_WORDS = {
  // ------------------------------------------------------------------ the form
  'form.submit': 'Submit',
  'form.next': 'Next',
  'form.back': 'Back',
  /** The stepper's name: the list of a paged form's steps. */
  'form.progress': 'Progress',
  /** Said after a group's name, where `aria-required` cannot be. */
  'form.required': 'required',

  // --------------------------------------------------------- the error summary
  'errors.heading': {
    one: 'There is {count} problem to fix',
    other: 'There are {count} problems to fix',
  },
  /**
   * One entry: the field's name and what is wrong with it, said. `{codes}` is still given —
   * the engine's codes, joined — for a host whose own wording of this entry used it.
   */
  'errors.entry': '{label}: {problems}',

  // ---------------------------------------------------------------- an error
  // What a field says for each code the engine reports (0191), with the field's own limit
  // filled in. A code the catalogue does not know — a validate rule's own — is said as itself.
  'error.required': 'This question needs an answer.',
  /** A required tick box is a consent gate: unticked is an answer, and only a tick will do. */
  'error.required.checkbox': 'Tick this box to continue.',
  /** A required repeater asks for a row, and a required file field for a file. */
  'error.required.rows': 'Add at least one row.',
  'error.required.files': 'Attach a file.',
  'error.invalid': 'This answer is not accepted.',
  'error.check_unavailable': 'This answer could not be checked just now. Try again in a moment.',
  'error.type': 'This is not the kind of answer this question takes.',
  'error.option': 'Choose one of the options offered.',
  // An option chosen alone or not at all, ticked with others (0199).
  'error.exclusive': 'One of the answers ticked can only be chosen on its own.',
  // A character count, under a field with a `maxLength` (0203): the limit while it is empty,
  // then what is left, then how many too many.
  'count.limit': { one: 'You can enter up to {count} character.', other: 'You can enter up to {count} characters.' },
  'count.left': { one: 'You have {count} character remaining.', other: 'You have {count} characters remaining.' },
  'count.over': { one: 'You have {count} character too many.', other: 'You have {count} characters too many.' },
  'error.duplicate': 'Rank each option only once.',
  'error.row': 'Answer only the rows this question asks about.',
  'error.min': 'Enter {min} or more.',
  'error.max': 'Enter {max} or less.',
  'error.step': 'Enter a value in steps of {step}.',
  'error.minLength': { one: 'Enter at least {count} character.', other: 'Enter at least {count} characters.' },
  'error.maxLength': { one: 'Enter at most {count} character.', other: 'Enter at most {count} characters.' },
  'error.pattern': 'Enter it in the form this question asks for.',
  'error.mask': 'Fill in every position of the format shown, each with what it takes.',
  'error.email': 'Enter an email address, such as name@example.com.',
  'error.url': 'Enter a web address that starts with https:// or http://.',
  'error.uuid': 'Enter an identifier of 32 hexadecimal digits in five groups.',
  /** `{format}` is the stored form a date, time or date and time takes. */
  'error.shape': 'Enter it as {format}.',
  'error.earliest': 'Enter {earliest} or later.',
  'error.latest': 'Enter {latest} or earlier.',
  'error.minItems.choices': { one: 'Choose at least {count}.', other: 'Choose at least {count}.' },
  'error.maxItems.choices': { one: 'Choose at most {count}.', other: 'Choose at most {count}.' },
  'error.minItems.files': { one: 'Attach at least {count} file.', other: 'Attach at least {count} files.' },
  'error.maxItems.files': { one: 'Attach at most {count} file.', other: 'Attach at most {count} files.' },
  'error.minItems.rows': { one: 'Add at least {count} row.', other: 'Add at least {count} rows.' },
  'error.maxItems.rows': { one: 'Add at most {count} row.', other: 'Add at most {count} rows.' },
  'error.maxFileSize': 'A file can be at most {maxFileSize}.',
  'error.accept': 'Attach a file of one of these types: {accept}.',
  'error.box': 'The signature goes outside its box. Clear it and sign again.',
  'error.maxPoints': 'The signature is too detailed to keep. Clear it and sign again.',

  // ----------------------------------------------------------- a submission, read back
  // What `answersInWords` says around a submission's answers (0193): not drawn on a form, said
  // to whoever reads one afterwards.
  'answer.yes': 'Yes',
  'answer.no': 'No',
  'answer.drawnSignature': 'A drawn signature',
  /** A repeater's row, counted from one: "Items 2". */
  'answer.row': '{label} {position}',

  // -------------------------------------------------------------- a repeater
  /** Only when the document gives the repeater no `addLabel` of its own. */
  'repeater.add': 'Add {label}',
  /** Only when the document gives the repeater no `removeLabel` of its own. */
  'repeater.remove': 'Remove {label}',
  /** A row's remove button: the author's word or the one above, and where the row is. */
  'repeater.removeRow': '{remove} {position} of {count}',
  'repeater.moveUp': 'Move {label} {position} of {count} up',
  'repeater.moveDown': 'Move {label} {position} of {count} down',

  // ---------------------------------------------------------------- a layout
  /** A tab whose section has no heading. */
  'tabs.unnamed': 'Tab {position}',

  // ------------------------------------------- options, typeahead, tag picker
  'options.unavailable':
    'This field\'s answers come from "{source}", which this application has not provided.',
  /** A typeahead's: typing asks again. */
  'options.failed': 'The options could not be loaded. Type to try again.',
  /** A plain select's: nobody can type into one, and moving to it asks again. */
  'options.failedListed':
    'The options could not be loaded. They are asked for again each time you move to this field.',
  /** A typeahead's, below its source's minimum. */
  'options.tooShort': {
    one: 'Type at least {count} character to search.',
    other: 'Type at least {count} characters to search.',
  },
  /** A plain select's, over a source that answers only a search of some length. */
  'options.searchOnly': "This field's answers are found by searching, which this list cannot do.",
  'options.searching': 'Searching…',
  /** A typeahead's, over every row there is, cut to what it shows. */
  'options.capped': 'Showing the first {shown} of {total} — keep typing to narrow.',
  /** A plain select's `options.capped`, which cannot ask anybody to type. */
  'options.cappedListed': { other: 'Showing the first {count} of {total}.' },
  /** A typeahead's, over a page that goes on: how many match is not known, so not said. */
  'options.more': { other: 'Showing the first {count}; there are more — keep typing to narrow.' },
  /** A plain select's `options.more`. */
  'options.moreListed': { other: 'Showing the first {count}; there are more than this list can show.' },
  /**
   * Either control's: rows the source matched and could not hand over, counted. Said of
   * the matches, not as "more": a page may withhold every row it matched and show none.
   */
  'options.withheld': {
    one: 'One match cannot be chosen here.',
    other: '{count} matches cannot be chosen here.',
  },
  'options.noMatch': 'No options match',
  /** The popup list's name, which must differ from the field's own. */
  'options.suggestions': '{label} suggestions',
  'tagpicker.chosen': '{label}: chosen',
  'tagpicker.remove': 'Remove {option}',

  // ----------------------------------------------------------------- ranking
  'ranking.order': '{label}: your order',
  'ranking.pool': '{label}: not ranked yet',
  'ranking.up': 'Move {option} up',
  'ranking.down': 'Move {option} down',
  'ranking.remove': 'Take {option} out of the order',
  'ranking.rank': 'Rank {option}',

  // ------------------------------------------------------------------- files
  'file.unavailable':
    'This form cannot accept files here, because no upload destination has been configured.',
  'file.up': 'Move {name}, {position} of {count}, up',
  'file.down': 'Move {name}, {position} of {count}, down',
  'file.remove': 'Remove {name}',
  'file.undo': 'Undo removing {name}',
  'file.waiting': 'Waiting',
  /** The progress bar's name. */
  'file.uploading': 'Uploading {name}',
  /** `{reason}` is the uploader's, and in whatever language the host's uploader writes. */
  'file.notAttached': 'Not attached: {reason}',
  'file.retry': 'Try {name} again',
  'file.dismiss': 'Dismiss {name}',
  'file.cancel': 'Cancel uploading {name}',
  // The field's live region.
  'file.status.uploading': 'Uploading {name}…',
  'file.status.failed': '{name} was not attached: {reason}',
  'file.status.failedSeveral': { other: '{count} files were not attached: {names}.' },

  // ----------------------------------------------------------------- scanner
  /** The visible word; the field's name follows it, hidden, in the button's name. */
  'scanner.scan': 'Scan',
  // The field's live region.
  'scanner.scanning': 'Scanning…',
  'scanner.noText': 'Scanning did not work: the scanner did not return text. Type the value instead.',
  /** `{reason}` is the host scanner's, in whatever language it writes. */
  'scanner.failed': 'Scanning did not work: {reason}. Type the value instead.',

  // ------------------------------------------------------------ formatted text
  'richtext.toolbar': 'Formatting for {label}',
  'richtext.strong': 'Bold',
  'richtext.emphasis': 'Italic',
  'richtext.link': 'Link',
  'richtext.bulletList': 'Bulleted list',
  'richtext.orderedList': 'Numbered list',
  /** The browser's prompt for a link's address. */
  'richtext.linkAddress': 'Address for the link',

  // --------------------------------------------------------------- signature
  'signature.typed': 'Type your name',
  'signature.clear': 'Clear',

  // ----------------------------------------------- a draft that came back changed
  'resume.heading': 'This form changed while you were away',
  'resume.breaking.kept':
    'It changed too much for your answers to be moved across, so this is being shown as you left it.',
  /** Drawn emphasised, between the two sentences beside it. */
  'resume.breaking.cannotSubmit': 'It cannot be submitted.',
  'resume.breaking.restart': 'Starting again will give you the current form.',
  'resume.setAside': {
    one: 'One question is no longer on this form. Your answer to it is still kept with the rest and will be sent with them — it is just not shown here any more.',
    other:
      '{count} questions are no longer on this form. Your answers to them are still kept with the rest and will be sent with them — they are just not shown here any more.',
  },
} as const satisfies Record<string, Message>

export type FormWordId = keyof typeof FORM_WORDS

/** One language's words, or a host's overrides of them: any subset of the ids. */
export type FormWords = { readonly [Id in FormWordId]?: Message }

/** A host's words, by BCP 47 locale: languages it adds, and words it changes. */
export type FormWordsByLocale = Readonly<Record<string, FormWords>>

/** What a word's placeholders are filled with. A list is joined as the message's language joins one. */
export type FormWordValues = Readonly<Record<string, string | number | readonly string[]>>

/** A form word, in the form's language, with its placeholders filled. */
export interface FormText {
  /**
   * The word, with `{name}` filled from `values`. A list given as an array is joined the
   * way the language the message is written in joins one — "a.pdf, b.pdf und c.pdf" — and
   * never the reader's when the message fell back to English: an English sentence with an
   * Italian "e" in it is in neither language.
   */
  (id: FormWordId, values?: FormWordValues): string
  /**
   * BCP 47: the language the words are in — the locale asked for, or its language, when
   * this has words for it; English otherwise. A host formatting anything else beside the
   * form's words gets the same answer this did.
   */
  readonly locale: string
}

export interface FormTextOptions {
  /**
   * The locale the form's document is read in: `resolvedLocale(engine.schema(),
   * engine.locale())` from `@formancy/spec`, which is the engine's locale when the document
   * has a catalogue for it and the document's default when it has not. Not `engine.locale()`
   * alone: a French reader of a form with no French was shown English questions over French
   * buttons. Empty for a document with no catalogue and no locale given, which is English.
   */
  readonly locale: string
  /** Languages a host adds, and words it changes in a shipped one — English included. */
  readonly words?: FormWordsByLocale
}

/** What this package ships, by language. English is the fallback, not an entry here. */
const SHIPPED: Readonly<Record<string, Readonly<Record<FormWordId, Message>>>> = {
  de: FORM_WORDS_DE,
  fr: FORM_WORDS_FR,
}

/**
 * The English this repository writes. It decides the list format too: `en` joins three
 * items with an Oxford comma, which the builder's English never has (0114).
 */
const ENGLISH = 'en-GB'

/**
 * The function a renderer calls for every word it draws.
 *
 * Built once per form rather than looked up per word, so the plural rules and the list
 * formats are constructed once each. The engine's locale is fixed for its lifetime, so
 * this is too.
 *
 * A word is the host's for the locale, then this package's for it, then the same two for
 * its language (`de` for `de-CH`), then the host's English, then this package's — one
 * message at a time, so a host translating into a language not shipped here has a usable
 * form at every step, and a host that changes an English word changes it for every reader
 * who ends up reading English, the reader of a form with no catalogue first among them.
 */
export function createFormText(options: FormTextOptions): FormText {
  const host = options.words ?? {}
  // English last, and addressable: `en-GB` is what this package writes and `en` what a host
  // most likely keys its English by. The empty locale is English and nothing else.
  const tags = [...new Set([...candidates(options.locale), ...candidates(ENGLISH)])]
  const sources = tags.flatMap((tag) => [
    ...(host[tag] === undefined ? [] : [{ tag, words: host[tag] }]),
    ...(SHIPPED[tag] === undefined ? [] : [{ tag, words: SHIPPED[tag] }]),
  ])
  const locale = sources.map((source) => source.tag).find(readable) ?? ENGLISH

  // Both by the language the message is IN, which a fallback makes different from the
  // reader's: an English sentence counted by Portuguese rules says "One question" about
  // none, and joined by Italian ones says "a.pdf e b.pdf".
  const rules = new Map<string, Intl.PluralRules>()
  const pluralFor = (tag: string): Intl.PluralRules =>
    made(rules, tag, (readable) => new Intl.PluralRules(readable))
  const lists = new Map<string, Intl.ListFormat>()
  const listFor = (tag: string): Intl.ListFormat =>
    made(lists, tag, (readable) => new Intl.ListFormat(readable, { style: 'long', type: 'conjunction' }))

  const text = (id: FormWordId, values: FormWordValues = {}): string => {
    const found = sources.find((source) => source.words[id] !== undefined)
    const tag = found?.tag ?? ENGLISH
    const message: Message = found?.words[id] ?? FORM_WORDS[id]
    const count = values['count']
    const template =
      typeof message === 'string'
        ? message
        : pluralForm(message, pluralFor(tag), typeof count === 'number' ? count : undefined)
    return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
      const value = values[name]
      // Visible rather than emptied: "Add ." hides that a value never arrived.
      if (value === undefined) return whole
      return typeof value === 'object' ? listFor(tag).format(value) : String(value)
    })
  }

  return Object.assign(text, { locale })
}

/** One `Intl` formatter per language, made for a tag `Intl` can read and English otherwise. */
function made<Formatter>(
  cache: Map<string, Formatter>,
  tag: string,
  make: (readable: string) => Formatter,
): Formatter {
  const known = cache.get(tag)
  if (known !== undefined) return known
  const fresh = make(readable(tag) ? tag : ENGLISH)
  cache.set(tag, fresh)
  return fresh
}

/** The locale, then its language: `de-CH`, then `de`. Nothing for the empty locale. */
function candidates(locale: string): string[] {
  if (locale === '') return []
  const language = locale.split(/[-_]/)[0]!.toLowerCase()
  return language === locale ? [locale] : [locale, language]
}

/**
 * Whether `Intl` has data for this locale, rather than quietly substituting the machine's.
 *
 * ECMA-402 resolves a locale it has no data for to the runtime's default, which is the
 * machine's (measured for the builder, 0114). And a tag that is not BCP 47 throws — which
 * in a builder is a host's mistake, loud once, and in a form is a respondent who cannot
 * answer it. A document's catalogue may be keyed by anything, so here it is English.
 */
function readable(locale: string): boolean {
  try {
    return Intl.PluralRules.supportedLocalesOf([locale]).length > 0
  } catch {
    return false
  }
}

function pluralForm(message: PluralMessage, rules: Intl.PluralRules, count: number | undefined): string {
  // Called without a count, the `other` form with `{count}` left visible.
  if (count === undefined) return message.other
  return message[rules.select(count)] ?? message.other
}

export { FORM_WORDS_DE } from './words-de.js'
export { FORM_WORDS_FR } from './words-fr.js'
// What a sourced control says, beside the words it says it in: every renderer reads both,
// and the engine neither (0177).
export { optionsStatus } from './options-status.js'
export type { OptionsStatusState } from './options-status.js'
