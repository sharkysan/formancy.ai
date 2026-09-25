import type { ReactElement, ReactNode } from 'react'
import type { FieldDef, FormSchema, LogicRule } from '@formancy/spec'
import { useField } from '@formancy/react'

/**
 * A document as an author reads it, derived from the document itself.
 *
 * Generated rather than hand-written beside the schema, because the hand-
 * written copy is the one that drifts: somebody changes a rule, the form does
 * the new thing, and the JSON beside it still shows the old one. One field per
 * line and one rule per line — the whole document is on the playground, and a
 * wall of JSON on a landing page is a wall.
 */
export function sourceOf(schema: FormSchema): string {
  const field = (def: FieldDef): string => {
    const parts = [`"key": ${JSON.stringify(def.key)}`, `"type": ${JSON.stringify(def.type)}`]
    if (def.required === true) parts.push('"required": true')
    if (def.format !== undefined) parts.push(`"format": ${JSON.stringify(def.format)}`)
    return `    { ${parts.join(', ')} }`
  }
  const rule = (r: LogicRule): string =>
    `    { "target": ${JSON.stringify(r.target)}, "kind": ${JSON.stringify(r.kind)},\n      "cel": ${JSON.stringify(r.cel)} }`

  return [
    '{',
    `  "specVersion": ${JSON.stringify(schema.specVersion)},`,
    '  "model": { "fields": [',
    schema.model.fields.map(field).join(',\n'),
    '  ]},',
    '  "logic": { "rules": [',
    (schema.logic?.rules ?? []).map(rule).join(',\n'),
    '  ]}',
    '}',
  ].join('\n')
}

const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g

/**
 * JSON, coloured. Keys, strings, literals — and the CEL, which is the part of
 * the document that does something, picked out from the strings around it.
 *
 * A tokenizer rather than a highlighting library: it colours one known shape
 * of JSON, and forty kilobytes of grammar to do that is forty kilobytes the
 * page's first paint waits for.
 */
export function highlight(source: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let celNext = false
  for (const match of source.matchAll(TOKEN)) {
    const index = match.index
    if (index > last) out.push(source.slice(last, index))
    const [whole, string, colon, literal, number] = match
    if (string !== undefined && colon !== undefined) {
      out.push(
        <span className="t-key" key={index}>
          {string}
        </span>,
        colon,
      )
      celNext = string === '"cel"'
    } else if (string !== undefined) {
      out.push(
        <span className={celNext ? 't-cel' : 't-str'} key={index}>
          {string}
        </span>,
      )
      celNext = false
    } else if (literal !== undefined) {
      out.push(
        <span className="t-lit" key={index}>
          {literal}
        </span>,
      )
    } else if (number !== undefined) {
      out.push(
        <span className="t-num" key={index}>
          {number}
        </span>,
      )
    }
    last = index + whole.length
  }
  if (last < source.length) out.push(source.slice(last))
  return out
}

/**
 * The document's rules, evaluating as you type.
 *
 * Read off the same engine that draws the form beside it, through the same
 * hook a consumer would use — so a rule lighting up here is the engine's
 * answer, not the page's opinion of what the answer ought to be.
 */
export function LiveRules({ rules }: { rules: readonly LogicRule[] }): ReactElement {
  return (
    <ul className="rules" aria-label="The rules, as the engine evaluates them">
      {rules.map((rule) => (
        <LiveRule key={`${rule.target}:${rule.kind}`} rule={rule} />
      ))}
    </ul>
  )
}

function LiveRule({ rule }: { rule: LogicRule }): ReactElement {
  const field = useField(rule.target)
  const [on, reading] = verdict(rule, field)

  return (
    <li className={on ? 'rule on' : 'rule'}>
      <span className="rule-dot" aria-hidden="true" />
      <code className="rule-cel">{rule.cel}</code>
      <span className="rule-target">
        {rule.target} · {rule.kind}
      </span>
      {/* Keyed by its text so the flash replays on every change. */}
      <b className="rule-reading" key={reading}>
        {reading}
      </b>
    </li>
  )
}

function verdict(
  rule: LogicRule,
  field: { visible: boolean; required: boolean; value: unknown },
): [boolean, string] {
  switch (rule.kind) {
    case 'visible':
      return field.visible ? [true, 'shown'] : [false, 'hidden']
    case 'required':
      return field.required ? [true, 'required'] : [false, 'optional']
    case 'computed':
      return typeof field.value === 'number'
        ? [true, field.value.toLocaleString('de-CH')]
        : [false, 'waiting']
    default:
      return [false, rule.kind]
  }
}
