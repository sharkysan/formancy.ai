import { layoutChildren } from '@formancy/spec'
import type { FieldDef, FormSchema, LayoutNode } from '@formancy/spec'
import type { BuilderText } from './messages.js'
import { locate } from './navigate.js'
import type {
  BuilderSession,
  CatalogueFile,
  CommandOutcome,
  ImportReport,
  Refusal,
} from './session.js'

/**
 * Translating a form: extracting its words into a catalogue, adding and removing
 * languages, and the file a translator works in.
 *
 * Out of `session.ts` because it is one concern with a reason of its own to
 * change — a translation memory, a vendor's file format — and because that file
 * stood exactly at its size ceiling the day a translation command needed one
 * more line. It is the seam that file's entry in `apps/docs/src/size.test.ts`
 * names: one concern per file, over the session's shared attempt-and-commit core.
 */

/** What a translation command needs from the session it belongs to. */
export interface SessionCore {
  /** The document as it stands. A function, because it changes with every commit. */
  document(): FormSchema
  attempt(edit: (draft: FormSchema) => Refusal | undefined): CommandOutcome
  refuse(path: string, message: string): Refusal
  text: BuilderText
}

type TranslationCommands = Pick<
  BuilderSession,
  | 'extractText'
  | 'extractAllText'
  | 'setMessage'
  | 'exportCatalogue'
  | 'importCatalogue'
  | 'lastImportReport'
  | 'addLocale'
  | 'removeLocale'
  | 'orphanedMessages'
>

export function translationCommands(core: SessionCore): TranslationCommands {
  /** What the last import wrote, refused and flagged, for the pane to report. */
  let lastImport: ImportReport | undefined

  return {
    extractText(keyPath, property, locale) {
      return core.attempt((draft) => {
        const found = locate(draft, keyPath)
        if (found === undefined) {
          return core.refuse(
            '/model/fields',
            core.text('refuse.noField', { path: keyPath.join('.') }),
          )
        }
        const field = found.siblings[found.index] as unknown as Record<string, unknown>
        const current = field[property]
        // Already a reference: nothing to extract, and re-seeding would overwrite a
        // translation with the language it came from.
        if (typeof current === 'object' && current !== null && '$t' in current) return undefined
        if (typeof current !== 'string') {
          return core.refuse(
            `/model/fields/${String(found.index)}/${property}`,
            core.text('refuse.notText', { property, path: keyPath.join('.') }),
          )
        }

        const defaultLocale = draft.i18n?.defaultLocale ?? locale ?? 'en'
        const id = `${keyPath.join('.')}.${property}`
        draft.i18n = {
          defaultLocale,
          messages: { ...draft.i18n?.messages },
        }
        draft.i18n.messages[defaultLocale] = {
          ...draft.i18n.messages[defaultLocale],
          [id]: current,
        }
        field[property] = { $t: id }
        return undefined
      })
    },

    extractAllText(locale) {
      return core.attempt((draft) => {
        const defaultLocale = draft.i18n?.defaultLocale ?? locale ?? 'en'
        const catalogue: Record<string, string> = { ...draft.i18n?.messages[defaultLocale] }
        const taken = new Set(Object.keys(catalogue))

        /** A readable id nothing else is using. */
        const mint = (base: string): string => {
          if (!taken.has(base)) {
            taken.add(base)
            return base
          }
          let counter = 2
          while (taken.has(`${base}.${String(counter)}`)) counter += 1
          const id = `${base}.${String(counter)}`
          taken.add(id)
          return id
        }

        /** Replace one property with a reference, keeping what it said. */
        const lift = (holder: Record<string, unknown>, property: string, base: string): void => {
          const current = holder[property]
          if (typeof current !== 'string') return
          const id = mint(base)
          catalogue[id] = current
          holder[property] = { $t: id }
        }

        const fields = (defs: FieldDef[], parent: readonly string[]): void => {
          for (const def of defs) {
            const at = [...parent, def.key]
            const path = at.join('.')
            lift(def as unknown as Record<string, unknown>, 'label', `${path}.label`)
            for (const option of def.options ?? []) {
              // By VALUE rather than by index: an option's value is its identity,
              // so the id reads as the thing it names rather than as a position.
              lift(
                option as unknown as Record<string, unknown>,
                'label',
                `${path}.option.${option.value}`,
              )
            }
            for (const column of def.columns ?? []) {
              lift(
                column as unknown as Record<string, unknown>,
                'header',
                `${path}.column.${column.field}`,
              )
            }
            fields(def.fields ?? [], at)
          }
        }
        fields(draft.model.fields, [])

        for (const layout of draft.layouts ?? []) {
          const walk = (nodes: LayoutNode[], trail: string): void => {
            for (const [index, node] of nodes.entries()) {
              const at = `${trail}.${node.kind}${String(index)}`
              lift(node as unknown as Record<string, unknown>, 'label', `${at}.label`)
              walk(layoutChildren(node) as LayoutNode[], at)
            }
          }
          walk(layout.nodes, layout.name)
        }

        // Nothing to lift: leave the document exactly as it was rather than
        // attaching an empty catalogue to a form nobody is translating.
        if (Object.keys(catalogue).length === 0) return undefined

        draft.i18n = {
          defaultLocale,
          messages: { ...draft.i18n?.messages, [defaultLocale]: catalogue },
        }
        return undefined
      })
    },

    setMessage(locale, id, message) {
      return core.attempt((draft) => {
        if (draft.i18n === undefined) {
          return core.refuse('/i18n', core.text('refuse.i18nNoneYet'))
        }
        draft.i18n = {
          ...draft.i18n,
          messages: {
            ...draft.i18n.messages,
            [locale]: { ...draft.i18n.messages[locale], [id]: message },
          },
        }
        return undefined
      })
    },

    exportCatalogue: (locale) => catalogueFile(core.document(), locale),

    importCatalogue(file) {
      // Read off the file rather than trusted: it comes from disk, from somebody
      // else's tool, and one that is not a catalogue threw "file.messages is not
      // iterable" — which both builders showed a translator as the reason.
      if (!isCatalogueFile(file)) return core.refuse('', core.text('refuse.notACatalogue'))
      const present = core.document()
      const live = referencedIds(present)
      const report: ImportReport = { written: 0, unknown: [], stale: [] }
      const source = present.i18n?.messages[present.i18n.defaultLocale] ?? {}

      const outcome = core.attempt((draft) => {
        const existing = { ...draft.i18n?.messages[file.locale] }
        for (const message of file.messages) {
          if (!live.has(message.id)) {
            report.unknown.push(message.id)
            continue
          }
          // Translated from words that have since changed. Written anyway --
          // something is better than nothing and the translator may well be
          // right -- and named, because it is the one a reviewer has to look at.
          if (message.source !== '' && source[message.id] !== message.source) {
            report.stale.push(message.id)
          }
          if (message.target === '') continue
          existing[message.id] = message.target
          report.written += 1
        }

        const defaultLocale = draft.i18n?.defaultLocale ?? file.defaultLocale
        draft.i18n = {
          defaultLocale,
          messages: { ...draft.i18n?.messages, [file.locale]: existing },
        }
        return undefined
      })

      if (outcome.ok) lastImport = report
      return outcome
    },

    lastImportReport: () => lastImport,

    addLocale(locale) {
      return core.attempt((draft) => {
        if (draft.i18n === undefined) {
          return core.refuse('/i18n', core.text('refuse.i18nNoneYet'))
        }
        // Present with nothing in it, so a translator can open the language and work
        // through it rather than having to translate something before it exists.
        draft.i18n = {
          ...draft.i18n,
          messages: { ...draft.i18n.messages, [locale]: { ...draft.i18n.messages[locale] } },
        }
        return undefined
      })
    },

    removeLocale(locale) {
      return core.attempt((draft) => {
        if (draft.i18n === undefined) return core.refuse('/i18n', core.text('refuse.i18nNone'))
        if (draft.i18n.defaultLocale === locale) {
          return core.refuse('/i18n/defaultLocale', core.text('refuse.defaultLocale', { locale }))
        }
        const messages = { ...draft.i18n.messages }
        delete messages[locale]
        draft.i18n = { ...draft.i18n, messages }
        return undefined
      })
    },

    orphanedMessages() {
      // The model and the layouts, and NOT `i18n` itself -- walking the catalogue
      // would find every id in it and report none of them. `referencedIds` is
      // that walk; this was a second copy of it.
      const present = core.document()
      const referenced = referencedIds(present)
      const known = new Set<string>()
      for (const catalogue of Object.values(present.i18n?.messages ?? {})) {
        for (const id of Object.keys(catalogue)) known.add(id)
      }
      return [...known].filter((id) => !referenced.has(id)).sort()
    },
  }
}

/**
 * A document's catalogue for one locale, as the file a translator works in.
 *
 * Every id the DOCUMENT refers to, not every id the catalogue holds: an orphan is
 * somebody's kept work and not a thing to send out for translation again. A function
 * of the document rather than of a session, because a model is asked from one too
 * (`translationPrompt`), and the two must not disagree about what is left to translate.
 */
export function catalogueFile(document: FormSchema, locale: string): CatalogueFile {
  const defaultLocale = document.i18n?.defaultLocale ?? 'en'
  const source = document.i18n?.messages[defaultLocale] ?? {}
  const target = document.i18n?.messages[locale] ?? {}
  return {
    locale,
    defaultLocale,
    messages: [...referencedIds(document)].map((id) => ({
      id,
      source: source[id] ?? '',
      target: target[id] ?? '',
    })),
  }
}

/** Whether something read from a file has the shape of a catalogue file at all. */
export function isCatalogueFile(file: unknown): file is CatalogueFile {
  if (typeof file !== 'object' || file === null) return false
  const record = file as Record<string, unknown>
  return typeof record['locale'] === 'string' && Array.isArray(record['messages'])
}

/** Every message id the document refers to. Shared by the export, the import and
 *  the orphan list, so the three can never disagree about which messages are live. */
export function referencedIds(document: FormSchema): Set<string> {
  const found = new Set<string>()
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    if (typeof value !== 'object' || value === null) return
    const record = value as Record<string, unknown>
    if (typeof record['$t'] === 'string') {
      found.add(record['$t'])
      return
    }
    for (const item of Object.values(record)) walk(item)
  }
  walk(document.model)
  walk(document.layouts)
  return found
}
