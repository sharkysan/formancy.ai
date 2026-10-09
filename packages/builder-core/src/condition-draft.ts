import { resolveText } from '@formancy/spec'
import type { FieldDef, FormSchema } from '@formancy/spec'
import { answerKindOf, operatorTakesValue, operatorsFor } from './conditions.js'
import type { AnswerKind, Condition, ConditionGroup, Operator } from './conditions.js'
import type { BuilderText } from './messages.js'
import { nameOf } from './tree.js'

/**
 * The condition being written, as a person has it on screen — decided once for
 * both builders' logic panels, which draw it and hand every edit back here
 * ([0091](../../../docs/decisions/0091-a-second-builder-is-a-binding.md),
 * [0127](../../../docs/decisions/0127-a-condition-nests-one-level.md)).
 *
 * The panels kept this state themselves, one copy each, and a flat list was all
 * either could hold. Comparisons that nest one level, and a value control that
 * follows the field compared, are three more decisions per edit — which field
 * still takes which comparison, whether the typed value survives a change of
 * field, what an emptied group becomes — and two copies of each would be two
 * answers waiting to differ.
 */

/** A field a condition may compare, with what the editor needs to offer for it. */
export interface ConditionField {
  /**
   * The data path the engine reads: a page is transparent, a group is a dot, and a
   * field in the rule's own row is `items[].qty`, which compiles to `item.qty`.
   */
  path: string
  label: string
  kind: AnswerKind
  /** For a choice or a list: what may be compared with, as the field offers it. */
  options: ReadonlyArray<{ value: string; label: string }>
}

/**
 * Every field a condition may compare, in document order, at the path the engine
 * reads.
 *
 * **Data paths, not the tree's key paths.** Both panels joined the key path, which
 * names a field inside a page `about.country` where the engine reads `country` — so
 * a condition on any field in a wizard compared a path no field has, evaluated as
 * null, and held its target hidden. Containers are left out, since a group or a page
 * has no answer to compare, and so is static text.
 *
 * **A repeater's fields only for a rule in its row.** A rule about the whole form
 * cannot say which row it means, so they are left out — unless `about` is a rule
 * target inside that repeater's row, which the engine evaluates once per row with
 * `item` bound to it. Then they are offered, named as being in this row, because
 * "Quantity is at least 3" under a field in the row does not say whose quantity
 * ([0129](../../../docs/decisions/0129-a-row-rule-is-written-in-the-row.md)).
 */
export function conditionFields(
  document: FormSchema,
  about?: { target: string; text: BuilderText },
): ConditionField[] {
  const locale = document.i18n?.defaultLocale ?? ''
  // `items` for a rule on `items[].note`: the one repeater whose row is in scope.
  const row = about?.target.includes('[]')
    ? about.target.slice(0, about.target.indexOf('[]'))
    : undefined
  const found: ConditionField[] = []
  const walk = (fields: readonly FieldDef[], scope: string, inRow: boolean): void => {
    for (const field of fields) {
      if (field.type === 'page') {
        walk(field.fields ?? [], scope, inRow)
        continue
      }
      if (field.type === 'group') {
        walk(field.fields ?? [], `${scope}${field.key}.`, inRow)
        continue
      }
      if (field.type === 'repeater') {
        if (`${scope}${field.key}` === row) walk(field.fields ?? [], `${row}[].`, true)
        continue
      }
      if (field.type === 'static') continue
      const name = nameOf(document, field)
      found.push({
        path: `${scope}${field.key}`,
        label:
          inRow && about !== undefined ? about.text('logic.field.inRow', { field: name }) : name,
        kind: answerKindOf(field),
        options: (field.options ?? []).map((option) => ({
          value: option.value,
          label: resolveText(document, option.label, locale) || option.value,
        })),
      })
    }
  }
  walk(document.model.fields, '', false)
  return found
}

/** One comparison, as a person has it on screen. */
export interface ConditionRow {
  field: string
  operator: Operator
  /**
   * What was typed or chosen, kept as text rather than as the narrowed value, so it
   * survives switching to a comparison that takes no value and back.
   */
  text: string
}

/** A group of comparisons inside the condition, joined its own way. */
export interface RowGroup {
  join: ConditionGroup['join']
  rows: readonly ConditionRow[]
}

/** The condition being written: comparisons and, one level down, groups of them. */
export interface ConditionDraft {
  join: ConditionGroup['join']
  items: ReadonlyArray<ConditionRow | RowGroup>
}

export function isRowGroup(item: ConditionRow | RowGroup): item is RowGroup {
  return 'rows' in item
}

/** Where an edit lands: a top-level item, or a row inside the group at `group`. */
export interface DraftPlace {
  at: number
  group?: number
}

const kindOf = (fields: readonly ConditionField[], path: string): AnswerKind =>
  fields.find((field) => field.path === path)?.kind ?? 'other'

/**
 * What a value starts as for a kind of field. Yes, for a checkbox: its control can
 * only show yes or no, and a draft holding nothing while the control showed "Yes"
 * compiled to `== false` — what was on screen and what was written disagreed.
 */
const startingText = (kind: AnswerKind): string => (kind === 'boolean' ? 'true' : '')

/** A fresh comparison on the first field, with the first comparison that field takes. */
export function emptyRow(fields: readonly ConditionField[]): ConditionRow {
  const first = fields[0]
  const kind = first?.kind ?? 'other'
  return { field: first?.path ?? '', operator: operatorsFor(kind)[0]!, text: startingText(kind) }
}

export function emptyDraft(fields: readonly ConditionField[]): ConditionDraft {
  return { join: 'all', items: [emptyRow(fields)] }
}

/** Another comparison, at the end of the condition or of one of its groups. */
export function addRow(
  draft: ConditionDraft,
  fields: readonly ConditionField[],
  group?: number,
): ConditionDraft {
  if (group === undefined) return { ...draft, items: [...draft.items, emptyRow(fields)] }
  return mapGroup(draft, group, (inner) => ({ ...inner, rows: [...inner.rows, emptyRow(fields)] }))
}

/** A group of one comparison: "(A and B) or C" starts as "(A) or C". */
export function addGroup(draft: ConditionDraft, fields: readonly ConditionField[]): ConditionDraft {
  return { ...draft, items: [...draft.items, { join: 'all', rows: [emptyRow(fields)] }] }
}

/**
 * The condition without one comparison or one group.
 *
 * A group whose last comparison is taken out goes with it — an empty group would be
 * refused by the compiler rather than compile to an expression that always passes.
 * And the condition keeps at least one item, for the same reason: removing the last
 * one returns the draft unchanged, and the panels offer no button for it.
 */
export function removeFromDraft(draft: ConditionDraft, place: DraftPlace): ConditionDraft {
  if (place.group !== undefined) {
    const inner = draft.items[place.group]
    if (inner === undefined || !isRowGroup(inner)) return draft
    if (inner.rows.length <= 1) return removeFromDraft(draft, { at: place.group })
    return mapGroup(draft, place.group, (group) => ({
      ...group,
      rows: group.rows.filter((_, index) => index !== place.at),
    }))
  }
  if (draft.items.length <= 1) return draft
  return { ...draft, items: draft.items.filter((_, index) => index !== place.at) }
}

/**
 * One comparison changed.
 *
 * A change of field keeps the comparison where the new field takes it and falls back
 * to that field's first one where it does not — "contains" means nothing to a date.
 * And it clears the value when the two fields take different kinds of value: a
 * choice's value typed against a number field would be refused at save.
 */
export function updateRow(
  draft: ConditionDraft,
  place: DraftPlace,
  change: Partial<ConditionRow>,
  fields: readonly ConditionField[],
): ConditionDraft {
  const next = (row: ConditionRow): ConditionRow => {
    const merged = { ...row, ...change }
    if (change.field === undefined || change.field === row.field) return merged
    const was = kindOf(fields, row.field)
    const now = kindOf(fields, change.field)
    const allowed = operatorsFor(now)
    return {
      ...merged,
      operator: allowed.includes(merged.operator) ? merged.operator : allowed[0]!,
      text: was === now ? merged.text : startingText(now),
    }
  }
  if (place.group !== undefined) {
    return mapGroup(draft, place.group, (group) => ({
      ...group,
      rows: group.rows.map((row, index) => (index === place.at ? next(row) : row)),
    }))
  }
  return {
    ...draft,
    items: draft.items.map((item, index) =>
      index === place.at && !isRowGroup(item) ? next(item) : item,
    ),
  }
}

/** How the condition, or one of its groups, joins what it holds. */
export function setJoin(
  draft: ConditionDraft,
  join: ConditionGroup['join'],
  group?: number,
): ConditionDraft {
  if (group === undefined) return { ...draft, join }
  return mapGroup(draft, group, (inner) => ({ ...inner, join }))
}

function mapGroup(
  draft: ConditionDraft,
  at: number,
  change: (group: RowGroup) => RowGroup,
): ConditionDraft {
  return {
    ...draft,
    items: draft.items.map((item, index) =>
      index === at && isRowGroup(item) ? change(item) : item,
    ),
  }
}

/**
 * One comparison as a condition, with the typed text narrowed to what the field
 * holds — by the field, not by what the text looks like.
 *
 * Narrowed by shape, a choice whose stored value is `"10"` became the number 10 and
 * was compared to a string field: a type error CEL catches at save, for a condition
 * the author built correctly. A number is a number only when the field is one, and a
 * yes-or-no is a boolean only when the field is a checkbox.
 */
export function conditionOf(row: ConditionRow, fields: readonly ConditionField[]): Condition {
  const answer = kindOf(fields, row.field)
  if (!operatorTakesValue(row.operator)) return { field: row.field, operator: row.operator, answer }
  const value: Condition['value'] =
    answer === 'number' && row.text.trim() !== '' && !Number.isNaN(Number(row.text))
      ? Number(row.text)
      : answer === 'boolean'
        ? row.text === 'true'
        : row.text
  return { field: row.field, operator: row.operator, value, answer }
}

/** The draft as the structured condition stored beside its CEL. */
export function groupOf(draft: ConditionDraft, fields: readonly ConditionField[]): ConditionGroup {
  return {
    join: draft.join,
    conditions: draft.items.map((item) =>
      isRowGroup(item)
        ? { join: item.join, conditions: item.rows.map((row) => conditionOf(row, fields)) }
        : conditionOf(item, fields),
    ),
  }
}

/** Every comparison in the draft, wherever it sits. */
export function rowsOf(draft: ConditionDraft): ConditionRow[] {
  return draft.items.flatMap((item) => (isRowGroup(item) ? [...item.rows] : [item]))
}
