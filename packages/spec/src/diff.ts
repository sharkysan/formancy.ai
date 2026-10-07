import { canonicalize, same } from './canonical.js'
import type { Change, FormSchema } from './types.js'
import { compareFields } from './diff-fields.js'
import { compareRules } from './diff-rules.js'

/**
 * Classify what changed between two schema versions, and how much it costs the
 * data already collected under the old one.
 *
 * This is the function draft migration, the builder's "what changed before you
 * publish" view, export column unioning and the consumer CI compatibility gate
 * all read from. Getting the severity model wrong is the one mistake that
 * cannot be refactored once there is production data.
 *
 * Identity is the DATA PATH, not the position and not the layout: a `group`
 * scopes its children (`g.child`), a `repeater` scopes rows (`items[].name`),
 * and a `page` scopes nothing — so moving a field to another wizard page is no
 * change at all, while moving it into a group is a removal plus an addition,
 * because the submission shape actually changed.
 *
 * A key that changes without a declared `renamedFrom` is reported as a removal
 * plus an addition rather than guessed at — guessing wrong silently moves one
 * field's data into another. A declared rename translates the data paths of
 * everything beneath it, so renaming a group carries its children along.
 *
 * ## Two questions, not one
 *
 * **What changed** and **what it costs the data** are different questions, and
 * the severity answers only the second. `compatible` means the document is
 * different and every stored answer keeps its path and its validity — a
 * rewritten translation, a relabelled option, a rearranged layout. A reader
 * wanting "did anything change at all" takes the length of this list; a reader
 * deciding whether to rebind a draft filters on severity.
 *
 * ## Nothing changes silently
 *
 * It used to. The function compared a field's identity, its type and its
 * `required` flag, and nothing else — so an option withdrawn from a radio, a
 * bound tightened, a rule added, a translation rewritten and a layout
 * rearranged all produced an EMPTY list, and two materially different
 * documents diffed to `[]`. That is worse than a wrong severity: an empty
 * answer tells all four readers above that nothing happened.
 *
 * So there are two catch-alls, and they are the point rather than a
 * tidying-up. A field whose remaining properties differ is reported as
 * `field.changed`; a top-level area with no comparator at all is reported as
 * `document.changed`. **Both are `lossy`**, because a change nobody examined
 * must not be called harmless — `lossy` rebinds the data and tells somebody,
 * which is the conservative direction ([`SAFETY-ANALYSIS.md`](../../../docs/regulatory/SAFETY-ANALYSIS.md) E3).
 */
export function diffSchemas(before: FormSchema, after: FormSchema): Change[] {
  if (canonicalize(before) === canonicalize(after)) return []

  const changes: Change[] = []

  if (before.specVersion !== after.specVersion) {
    // Upwards is a superset and costs nothing: version 2 adds field types and
    // layout kinds and removes none, so a document that was valid stays valid
    // and every answer keeps its path. Downwards is not, because whatever was
    // added is now unreadable — and this is a diff, so it has to say which
    // direction it is looking.
    const upgrade = before.specVersion < after.specVersion
    changes.push({
      severity: upgrade ? 'compatible' : 'breaking',
      kind: 'specVersion.changed',
      path: 'specVersion',
      detail: upgrade
        ? `Spec version ${before.specVersion} to ${after.specVersion}. Version ${after.specVersion} only adds, so the data keeps its shape.`
        : `Spec version ${before.specVersion} to ${after.specVersion}. A reader of the older version cannot be given what the newer one added, so existing data cannot be rebound automatically.`,
    })
  }

  changes.push(...compareNaming(before, after))
  const fields = compareFields(before, after)
  changes.push(...fields.changes)
  changes.push(...compareRules(before.logic?.rules ?? [], after.logic?.rules ?? [], fields.renamed))
  changes.push(...compareText(before, after))
  changes.push(...compareLayouts(before, after))
  changes.push(...unexplainedAreas(before, after))

  return changes.sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind))
}

/**
 * Every top-level key some comparator above is responsible for.
 *
 * The list exists so that a key added to `FormSchema` and forgotten here is
 * reported rather than ignored. It is the whole of `unexplainedAreas`' logic,
 * and the reason a future `attachments` or `access` section cannot slip
 * through as "no change".
 */
const EXPLAINED_AREAS: ReadonlySet<string> = new Set([
  'specVersion',
  'id',
  'title',
  'model',
  'logic',
  'i18n',
  'layouts',
])

/** What a form is called. Never part of an answer, so never worse than compatible. */
function compareNaming(before: FormSchema, after: FormSchema): Change[] {
  const changes: Change[] = []

  if (before.title !== after.title) {
    changes.push({
      severity: 'compatible',
      kind: 'document.relabelled',
      path: 'title',
      detail: `Title "${before.title}" to "${after.title}". Nothing a submission carries depends on it.`,
    })
  }

  if (before.id !== after.id) {
    /*
     * Not cosmetic. The id is how a submission, an export and a consumer's
     * generated type all name this form, so a changed id is a different form
     * wearing the old one's history. Reported as lossy rather than breaking
     * because the answers themselves still rebind by path.
     */
    changes.push({
      severity: 'lossy',
      kind: 'document.identityChanged',
      path: 'id',
      detail: `Form id "${before.id}" to "${after.id}". Anything addressing this form by id — an export, a generated type, an integration — is addressing something else now.`,
    })
  }

  return changes
}

/**
 * The message catalogues.
 *
 * Always `compatible`: a catalogue says how a question reads, never what it
 * stores, so no answer moves and none becomes invalid. Reported all the same,
 * because "the wording of this form changed between these two versions" is
 * exactly what somebody comparing one reporting period with another needs to
 * know, and it is the kind of change that used to vanish entirely.
 */
function compareText(before: FormSchema, after: FormSchema): Change[] {
  const changes: Change[] = []

  const wasDefault = before.i18n?.defaultLocale
  const nowDefault = after.i18n?.defaultLocale
  if (wasDefault !== nowDefault) {
    changes.push({
      severity: 'compatible',
      kind: 'text.changed',
      path: 'i18n.defaultLocale',
      detail: `The language an untranslated string falls back to is ${nowDefault ?? 'unset'} rather than ${wasDefault ?? 'unset'}.`,
    })
  }

  const was = before.i18n?.messages ?? {}
  const now = after.i18n?.messages ?? {}
  for (const locale of [...new Set([...Object.keys(was), ...Object.keys(now)])].sort()) {
    if (same(was[locale], now[locale])) continue
    changes.push({
      severity: 'compatible',
      kind: 'text.changed',
      path: `i18n.messages.${locale}`,
      detail:
        was[locale] === undefined
          ? `A ${locale} catalogue was added. No answer changes; the form can be read in one more language.`
          : now[locale] === undefined
            ? `The ${locale} catalogue was removed. Readers asking for it fall back to the default locale.`
            : `The ${locale} catalogue reads differently. No answer moves, but a submission collected before this was given to different wording.`,
    })
  }

  return changes
}

/**
 * Named arrangements.
 *
 * Always `compatible`: a layout places fields and chooses their headings, and
 * neither decides what a field collects — identity here is the data path, and
 * a layout has no say in it. A field a layout stops placing is still in the
 * model and still in the submission, which is why this is not a removal.
 */
function compareLayouts(before: FormSchema, after: FormSchema): Change[] {
  const was = new Map((before.layouts ?? []).map((layout) => [layout.name, layout]))
  const now = new Map((after.layouts ?? []).map((layout) => [layout.name, layout]))
  const changes: Change[] = []

  for (const name of [...new Set([...was.keys(), ...now.keys()])].sort()) {
    if (same(was.get(name), now.get(name))) continue
    changes.push({
      severity: 'compatible',
      kind: 'layout.changed',
      path: `layouts.${name}`,
      detail: !was.has(name)
        ? `A "${name}" arrangement was added. The model is unchanged, so no answer moves.`
        : !now.has(name)
          ? `The "${name}" arrangement was removed. Anything rendering it falls back to model order.`
          : `The "${name}" arrangement places its fields differently. The model is unchanged, so no answer moves.`,
    })
  }

  return changes
}

/**
 * A top-level section no comparator above is responsible for.
 *
 * The backstop that makes silence impossible. A section added to the format
 * and forgotten here is reported as a change nobody classified, which is a
 * line in a publish review and a migration report rather than an empty list.
 */
function unexplainedAreas(before: FormSchema, after: FormSchema): Change[] {
  const left = before as unknown as Record<string, unknown>
  const right = after as unknown as Record<string, unknown>

  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((area) => !EXPLAINED_AREAS.has(area) && !same(left[area], right[area]))
    .sort()
    .map((area) => ({
      severity: 'lossy' as const,
      kind: 'document.changed',
      path: area,
      detail: `"${area}" differs, and this diff has no rule for what it costs stored answers. Reported as though it costs something, because a change nobody examined must not be called harmless.`,
    }))
}
