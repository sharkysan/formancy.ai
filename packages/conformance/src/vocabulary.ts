import type { FieldType, RuleKind } from '@formancy/spec'

/*
 * The spec's vocabulary as a fixture may use it: which field types, which of them hold
 * other fields, which carry no accessible name, and which rule kinds. Apart from the
 * validator because it changes for another reason — the spec gaining a type or a kind —
 * and because the records are total, so that day is a compile error here.
 */

/**
 * Mirrors `FieldType` from @formancy/spec. Declared as a total record so the
 * compiler fails here the day the spec adds or drops a field type, rather than
 * the validator silently accepting a type the renderers cannot draw.
 */
export const FIELD_TYPES: Record<FieldType, true> = {
  text: true,
  textarea: true,
  number: true,
  checkbox: true,
  select: true,
  radio: true,
  selectboxes: true,
  ranking: true,
  date: true,
  time: true,
  datetime: true,
  file: true,
  richtext: true,
  signature: true,
  hidden: true,
  static: true,
  group: true,
  page: true,
  repeater: true,
}

export const FIELD_TYPE_SET: ReadonlySet<string> = new Set(Object.keys(FIELD_TYPES))

/** Types that hold other fields, and are the only types allowed to declare them. */
const CONTAINER_TYPES: Partial<Record<FieldType, true>> = {
  group: true,
  page: true,
  repeater: true,
}

export const CONTAINER_TYPE_SET: ReadonlySet<string> = new Set(Object.keys(CONTAINER_TYPES))

/**
 * Types that carry no accessible name of their own: `hidden` never renders and
 * `static` is prose, not a control. Every other leaf is a control a driver has
 * to find by its label.
 */
export const UNLABELLED_TYPES: ReadonlySet<string> = new Set(['hidden', 'static'])

/**
 * Mirrors `RuleKind` from @formancy/spec, total for the same reason as
 * `FIELD_TYPES`: the compiler fails here the day the spec grows a kind.
 */
export const RULE_KINDS: Record<RuleKind, true> = {
  visible: true,
  disabled: true,
  required: true,
  computed: true,
  validate: true,
  check: true,
  skip: true,
}

export const RULE_KIND_SET: ReadonlySet<string> = new Set(Object.keys(RULE_KINDS))
