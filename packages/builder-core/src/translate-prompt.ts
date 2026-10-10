import { DECLINE_KEY } from '@formancy/spec'
import type { FormSchema } from '@formancy/spec'
import { catalogueFile } from './translation.js'

/**
 * What a model is told when it is asked for the messages a language is missing.
 *
 * Model-facing English, as `authoring.ts`'s briefing is, and for the same reason: the
 * answer is checked against this wording, and what was wrong with it is shown to the
 * person as the model was told it. `translate.ts` asks and checks, and says nothing.
 *
 * **Only the form's words, and where it uses them.** The request is built from a
 * `FormSchema` and nothing else, so no submission and no sample answer can reach it; and
 * from that document it takes the messages and the place each is used — never the rules,
 * never the document itself, which is what `authorForm` sends and this has no need of
 * ([0161](../../../docs/decisions/0161-a-model-translates-only-what-is-missing.md)).
 */

/** One message asked for: the catalogue file's row, and where the form uses it. */
export interface TranslationRow {
  readonly id: string
  /** What it says in the default locale. */
  readonly source: string
  /** Always empty: a message is asked for only while nobody has written it in this language. */
  readonly target: ''
  /** Where the form uses it, for a model: `label of a select question "Country"`. */
  readonly context: string
}

/** A request for a language's missing messages, before anything has gone wrong. */
export interface TranslationRequest {
  /** The language asked for. */
  readonly locale: string
  /** The language every source is in. */
  readonly defaultLocale: string
  /** Every message the form refers to with no target in `locale`, in the order a reader meets them. */
  readonly rows: readonly TranslationRow[]
  /** The briefing: what to keep, what to write, how to answer. */
  readonly system: string
  /** The rows as the catalogue file to fill in, and the translations already there for their register. */
  readonly user: string
}

/**
 * The request for every message `locale` is missing.
 *
 * The rows are the export's — `catalogueFile`, the file a translator downloads — with a
 * target still empty, so the two cannot disagree about what is left: every message the
 * document refers to, and never an orphan, which is somebody's kept work rather than
 * something to translate again. Each gains where it is used, because `country.option.CH`
 * is the schema's name for a thing, and "Switzerland" alone does not say whether it is an
 * answer, a heading or a country being asked about.
 */
export function translationPrompt(document: FormSchema, locale: string): TranslationRequest {
  const file = catalogueFile(document, locale)
  const places = placesOf(document)
  const rows = file.messages
    .filter((message) => message.target === '')
    .map((message) => ({
      id: message.id,
      source: message.source,
      target: '' as const,
      context: (places.get(message.id) ?? []).join('; '),
    }))
  // The register to match: what this language already says for this form. Live
  // messages only, as the rows are — an orphan is not how the form reads now.
  const done = file.messages.filter((message) => message.target !== '')

  const user = [
    `Translate these messages from "${file.defaultLocale}" into "${locale}".`,
    '',
    done.length === 0
      ? `Nothing in this form is translated into "${locale}" yet.`
      : `Already translated into "${locale}" in this form, for the register to match:`,
    ...done.map((message) => `- ${JSON.stringify(message.source)} → ${JSON.stringify(message.target)}`),
    '',
    'The catalogue file to fill in:',
    JSON.stringify({ locale, defaultLocale: file.defaultLocale, messages: rows }, null, 2),
  ].join('\n')

  return { locale, defaultLocale: file.defaultLocale, rows, system: translationBriefing(), user }
}

/**
 * The briefing, which is the same for every language and every form — and so can be pinned
 * by a server that asks the model on the browser's behalf (`model-requests.ts`, 0166).
 */
export function translationBriefing(): string {
  return [
    'You translate the words of a form for a form builder, which checks your answer and shows it to a person before anything is used.',
    '',
    'You are given a catalogue file: JSON with "locale", the language to write; "defaultLocale", the language the sources are in; and "messages", each with "id", "source", "target" and "context". Every "target" is empty because nobody has translated that message yet.',
    '',
    'Rules:',
    '- Keep every "id" and every "source" exactly as given. Write only "target".',
    '- Translate what the source says, for the place "context" names: a label stays a label, an answer stays an answer. Add nothing and leave nothing out.',
    '- Match the register of the translations this form already has in that language, when it has some.',
    '- When you are unsure of a message, leave its "target" as "". An empty target never erases anything: it leaves the message for a person.',
    '- Answer with the catalogue file as JSON only — "locale", "defaultLocale" and "messages" with "id", "source" and "target" — and nothing else. No commentary, no code fence. "context" may be left out.',
    // Built with the key rather than typed out, as the authoring briefing's is, so the
    // example a model copies is the shape the answer is read by.
    `If you cannot translate into this language at all, answer ${JSON.stringify({ [DECLINE_KEY]: '<why, for the person who asked>' })} instead.`,
  ].join('\n')
}

/** What was wrong with an answer, in the words a model is given back. */
export const TRANSLATION_COMPLAINTS = {
  notJson: 'That was not JSON. Answer with the catalogue file alone: no commentary, no code fence.',
  notACatalogue: (why: string): string =>
    `That was not the catalogue file: ${why} Answer with "locale", "defaultLocale" and "messages", each message with "id", "source" and "target" as strings.`,
  noLocale: 'it has no "locale".',
  noMessages: 'it has no "messages" list.',
  badMessage: (index: number): string =>
    `message ${String(index + 1)} does not have "id", "source" and "target" as strings.`,
  wrongLocale: (got: string, asked: string): string =>
    `That catalogue is for "${got}", and this request is for "${asked}". Answer with the same file, "locale": "${asked}", every target written in that language.`,
  unexplainedDecline: `A decline needs a reason, written for the person who asked. If you cannot translate into this language, answer ${JSON.stringify({ [DECLINE_KEY]: '<why, for the person who asked>' })}; if you can, answer with the catalogue file.`,
} as const

/** The complaint, as the model is told it — appended to the request, and alone as the follow-up. */
export function translationComplaint(detail: string): string {
  return `Your previous answer was rejected. Fix exactly this and answer again:\n${detail}`
}

/** Which field, layout node or neither an object in the walk is, and what it was reached through. */
interface Around {
  /** The nearest field: its type, and its words in the default locale, quoted. */
  readonly field?: { readonly type: string; readonly name: string }
  /** The nearest layout node, and the kind of the node holding it. */
  readonly node?: { readonly kind: string; readonly within: string | undefined }
  /** The property the walk came through to reach this object: `options`, `rows`, `image`. */
  readonly via?: string
}

/**
 * Where each message the document refers to is used, in words a model reads.
 *
 * **Shaped like `referencedIds`**: every value under the model and the layouts, a
 * reference noted where it is found and not descended into. So a message that walk calls
 * live is one this one places — a property the spec gains tomorrow included, named by
 * its own key until somebody words it.
 */
function placesOf(document: FormSchema): Map<string, string[]> {
  const defaults = document.i18n?.messages[document.i18n.defaultLocale] ?? {}
  /** What a piece of text says in the default locale, quoted, or the fallback. */
  const said = (text: unknown, fallback: string): string => {
    const id = referenceIn(text)
    const words = id === undefined ? text : defaults[id]
    return JSON.stringify(typeof words === 'string' ? words : fallback)
  }
  const places = new Map<string, string[]>()

  /** `value`, reached through `property` of `parent`, inside `around`. */
  const walk = (
    value: unknown,
    around: Around,
    property: string,
    parent: Record<string, unknown>,
  ): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item, around, property, parent)
      return
    }
    if (typeof value !== 'object' || value === null) return
    const id = referenceIn(value)
    if (id !== undefined) {
      const place = placeOf(property, parent, around)
      const known = places.get(id) ?? []
      if (!known.includes(place)) places.set(id, [...known, place])
      return
    }
    const record = value as Record<string, unknown>
    const here = holder(record, { ...around, via: property }, said)
    for (const [key, item] of Object.entries(record)) walk(item, here, key, record)
  }
  walk(document.model, {}, 'model', {})
  walk(document.layouts, {}, 'layouts', {})
  return places
}

/** The message id an object refers to, read as `referencedIds` reads one. */
function referenceIn(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const id = (value as Record<string, unknown>)['$t']
  return typeof id === 'string' ? id : undefined
}

/** What an object is to the walk: a field, a layout node, or a part of the one around it. */
function holder(
  record: Record<string, unknown>,
  around: Around,
  said: (text: unknown, fallback: string) => string,
): Around {
  const { key, type, kind, label } = record
  if (typeof key === 'string' && typeof type === 'string') {
    return { field: { type, name: said(label, key) } }
  }
  if (typeof kind === 'string') {
    return {
      ...(around.field === undefined ? {} : { field: around.field }),
      node: { kind, within: around.node?.kind },
    }
  }
  return around
}

/** One place a message is used, as a model is told it. */
function placeOf(property: string, record: Record<string, unknown>, here: Around): string {
  const field = here.field
  const of = field === undefined ? 'the form' : field.name
  const isField = typeof record['key'] === 'string' && typeof record['type'] === 'string'

  if (isField && property === 'label' && field !== undefined) return fieldLabel(field.type, field.name)
  if (typeof record['kind'] === 'string' && property === 'label' && here.node !== undefined) {
    return nodeLabel(here.node.kind, here.node.within)
  }
  if (here.via === 'options' && property === 'label') return `option of ${of}`
  if (here.via === 'rows' && property === 'label') return `row of ${of}, answered with its options`
  if (here.via === 'columns' && property === 'header') return `short column heading in ${of}`
  if (here.via === 'image' && property === 'alt') {
    return `description of the picture beside an option of ${of}, for someone who cannot see it`
  }
  return `"${property}" of ${of}`
}

function fieldLabel(type: string, name: string): string {
  switch (type) {
    case 'page':
      return `title of a page ${name}`
    case 'group':
      return `heading of a group of questions ${name}`
    case 'repeater':
      return `heading of a list the reader adds rows to ${name}`
    case 'static':
      return `text shown in the form, which asks nothing: ${name}`
    case 'hidden':
      return `label of a hidden field, which the reader does not see: ${name}`
    default:
      return `label of a ${type} question ${name}`
  }
}

function nodeLabel(kind: string, within: string | undefined): string {
  if (within === 'tabs') return 'name of a tab'
  switch (kind) {
    case 'section':
      return 'heading of a section of the form'
    case 'tabs':
      return 'name of a strip of tabs, read out to screen-reader users'
    case 'table':
      return 'heading of a grid of questions'
    case 'qrcode':
      return 'label of a code that shows an answer, read out to screen-reader users'
    default:
      return `label of a ${kind} in the arrangement`
  }
}
