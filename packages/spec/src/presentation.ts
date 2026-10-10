import { layoutChildren } from './layout.js'
import type { FieldDef, FormI18n, FormSchema, MessageRef, Text } from './types.js'
import type { LayoutNode } from './layout.js'

/**
 * Reading the presentation sections: text that may be translated, and layouts
 * that may place fields somewhere other than model order.
 *
 * Both are OPTIONAL. A schema with neither behaves exactly as it always has —
 * plain-string labels, fields rendered in model order — which is what lets
 * these sections land without breaking a single existing form.
 */

/** True when a piece of text is a reference into the message catalogue. */
export function isMessageRef(text: Text | undefined): text is MessageRef {
  return typeof text === 'object' && text !== null && typeof (text as MessageRef).$t === 'string'
}

/**
 * The string a person should read, in the locale asked for.
 *
 * A missing translation falls back to the default locale rather than showing a
 * message id: an untranslated label is a small problem, and `email.label`
 * appearing in the interface is a large one. Returns undefined only when the
 * id resolves nowhere, so a caller can fall back to something of its own.
 */
export function resolveText(
  /**
   * Only the catalogues are read, so this asks for only the catalogues —
   * which lets a caller holding a read-only view of a schema (the conformance
   * drivers do) resolve text without casting its whole document mutable.
   */
  schema: { readonly i18n?: Readonly<FormI18n> | undefined },
  text: Text | undefined,
  locale: string,
): string | undefined {
  if (text === undefined) return undefined
  if (!isMessageRef(text)) return text

  const messages = schema.i18n?.messages
  if (messages === undefined) return undefined

  const asked = messages[resolvedLocale(schema, locale)]?.[text.$t]
  if (asked !== undefined) return asked

  const fallbackLocale = schema.i18n?.defaultLocale
  if (fallbackLocale === undefined) return undefined
  return messages[fallbackLocale]?.[text.$t]
}

/**
 * The catalogue a document is read from for a reader asking for `locale`: that locale's
 * when the document has one, and its default when it has not — exactly the catalogue
 * {@link resolveText} reads, which is why it reads through this. A message the chosen
 * catalogue lacks still falls back to the default one message at a time; that is the
 * author's translation in progress, not a different language chosen.
 *
 * No region falls back to its language: a `de-CH` reader of a document with only `de`
 * reads its default. A document with no catalogue at all has nothing to choose between,
 * so the locale asked for is the only statement of what language its plain strings are in.
 *
 * Exported because something else must be in the same language as the questions — the
 * renderers' own words ([0171](../../../docs/decisions/0171-the-renderers-words-are-the-forms-language.md)).
 * Chosen by the engine's locale instead, a French reader of an English and German form
 * read English questions over French buttons.
 */
export function resolvedLocale(
  schema: { readonly i18n?: Readonly<FormI18n> | undefined },
  locale: string,
): string {
  const i18n = schema.i18n
  if (i18n === undefined || i18n.messages[locale] !== undefined) return locale
  return i18n.defaultLocale
}

/**
 * The data paths a named layout does not place.
 *
 * A layout is allowed to leave fields out — a print layout that omits the
 * consent checkbox is doing its job. But a field silently missing from the ONE
 * layout a form uses is invisible to everyone filling it in, so a builder needs
 * to be able to say so. Returns undefined when no layout has that name.
 */
export function unreferencedPaths(schema: FormSchema, layoutName: string): string[] | undefined {
  const layout = schema.layouts?.find((candidate) => candidate.name === layoutName)
  if (layout === undefined) return undefined

  const placed = new Set<string>()
  collectFieldPaths(layout.nodes, placed)

  // A group placed whole places its fields, and a group one of whose fields is placed cannot
  // be placed as well. Listing either offered a builder a placement the validator refuses.
  const within = (path: string, group: string): boolean => path.startsWith(`${group}.`)
  return modelPathsForLayout(schema.model.fields, '').filter(
    (path) =>
      !placed.has(path) && ![...placed].some((other) => within(path, other) || within(other, path)),
  )
}

/** Every path a layout node tree places, in no particular order. */
export function collectFieldPaths(nodes: readonly LayoutNode[], into: Set<string>): void {
  for (const node of nodes) {
    if (node.kind === 'field') into.add(node.path)
    // `layoutChildren`, not `node.children`: a `qrcode` node is childless and is not a
    // field, so reading `children` here walked into `undefined`.
    else collectFieldPaths(layoutChildren(node), into)
  }
}

/**
 * The paths a layout may legally place: every field, container or leaf, with
 * repeater templates excluded — a layout arranges the form a person sees, and
 * the rows inside a repeater are arranged by the repeater itself.
 */
export function modelPathsForLayout(fields: readonly FieldDef[], prefix: string): string[] {
  const paths: string[] = []
  for (const field of fields) {
    if (field.type === 'page') {
      paths.push(...modelPathsForLayout(field.fields ?? [], prefix))
      continue
    }
    const path = prefix + field.key
    paths.push(path)
    if (field.type === 'group') paths.push(...modelPathsForLayout(field.fields ?? [], `${path}.`))
  }
  return paths
}
