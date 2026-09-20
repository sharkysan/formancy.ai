// Generates src/content/docs/reference/spec.md from the spec package's JSON
// Schema. The schema is the single source of truth: every property in
// packages/spec/formancy.schema.json carries an author-facing title and
// description, and this script only arranges them into a page. Run via the
// predev/prebuild scripts in package.json, or directly:
//
//   node scripts/generate-spec-reference.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCHEMA_URL = new URL('../../../packages/spec/formancy.schema.json', import.meta.url)
const OUTPUT_URL = new URL('../src/content/docs/reference/spec.md', import.meta.url)

const schema = JSON.parse(readFileSync(SCHEMA_URL, 'utf8'))
const defs = schema.$defs ?? {}

/** Resolve a local `$ref` into its definition, or return the node unchanged. */
function deref(node) {
  if (node !== null && typeof node === 'object' && typeof node.$ref === 'string') {
    const name = node.$ref.replace('#/$defs/', '')
    const resolved = defs[name]
    if (resolved === undefined) throw new Error(`Unresolvable $ref: ${node.$ref}`)
    return { node: resolved, refName: name }
  }
  return { node, refName: undefined }
}

/** A short human label for what a property holds. */
function typeLabel(rawNode) {
  const { node, refName } = deref(rawNode)
  if (node.const !== undefined) return `the constant \`${JSON.stringify(node.const)}\``
  if (refName !== undefined) return `${node.title ?? refName} (see below)`
  if (Array.isArray(node.oneOf) && node.oneOf.every((branch) => branch.const !== undefined)) {
    return `one of ${node.oneOf.map((branch) => `\`${JSON.stringify(branch.const)}\``).join(', ')}`
  }
  if (node.type === 'array') {
    const items = node.items === undefined ? undefined : deref(node.items).node
    return items?.title !== undefined ? `array of ${items.title}` : 'array'
  }
  return node.type ?? 'value'
}

/** The constraint facts a property carries, as short fragments. */
function constraints(rawNode) {
  const { node } = deref(rawNode)
  const facts = []
  if (node.default !== undefined) facts.push(`default \`${JSON.stringify(node.default)}\``)
  if (node.minLength !== undefined) facts.push(`min length ${node.minLength}`)
  if (node.maxLength !== undefined) facts.push(`max length ${node.maxLength}`)
  if (node.minimum !== undefined) facts.push(`minimum ${node.minimum}`)
  if (node.maximum !== undefined) facts.push(`maximum ${node.maximum}`)
  if (node.minItems !== undefined) facts.push(`at least ${node.minItems} item${node.minItems === 1 ? '' : 's'}`)
  if (node.pattern !== undefined) facts.push(`pattern \`${node.pattern}\``)
  return facts
}

/** One property as a definition-style block. */
function renderProperty(name, rawNode, requiredNames) {
  const { node } = deref(rawNode)
  // A property may carry its own title and description NEXT TO a $ref
  // (`renamedFrom` describes the rename, not the key format); its own words win.
  const title = rawNode.title ?? node.title
  const description = rawNode.description ?? node.description
  const lines = []
  const required = requiredNames.includes(name) ? 'required' : 'optional'
  const facts = [required, typeLabel(rawNode), ...constraints(rawNode)]
  lines.push(`#### \`${name}\``)
  lines.push('')
  lines.push(facts.join(' · '))
  lines.push('')
  if (title !== undefined && title !== name) lines.push(`**${title}.** ${description ?? ''}`.trim())
  else if (description !== undefined) lines.push(description)
  const examples = rawNode.examples ?? node.examples
  if (Array.isArray(examples) && examples.length > 0) {
    lines.push('')
    lines.push(`Examples: ${examples.map((example) => `\`${JSON.stringify(example)}\``).join(', ')}`)
  }
  lines.push('')
  return lines.join('\n')
}

function renderProperties(node, heading = '####') {
  const requiredNames = node.required ?? []
  return Object.entries(node.properties ?? {})
    .map(([name, child]) => renderProperty(name, child, requiredNames).replaceAll('#### ', `${heading} `))
    .join('\n')
}

/** A oneOf of constants (field types, rule kinds, formats) as a value list. */
function renderConstants(oneOf) {
  return oneOf
    .map((branch) => `- \`"${branch.const}"\` — **${branch.title}.** ${branch.description ?? ''}`.trim())
    .join('\n')
}

const out = []

out.push(`---
title: Spec reference (v0)
description: Every property of a formancy form document, generated from the JSON Schema in packages/spec.
---

:::note[This page is generated]
Generated from \`packages/spec/formancy.schema.json\` (the JSON Schema for spec
version 0) by \`apps/docs/scripts/generate-spec-reference.mjs\`. The schema is
the source of truth — edit it, not this page.
:::

:::caution
Spec version 0 is **unstable**. See [Versioning](/concepts/versioning/) for what
that means and when it freezes.
:::
`)

// ------------------------------------------------------------- the document
out.push(`## The form document\n`)
out.push(`${schema.description}\n`)
out.push(renderProperties(schema, '###'))

// ---------------------------------------------------------------- the field
const field = defs.field
out.push(`## Fields\n`)
out.push(`${field.description}\n`)
out.push(`### Properties every field has\n`)
out.push(renderProperties(field))

// Field types, from the fieldType oneOf branches.
const fieldType = defs.fieldType
out.push(`### Field types\n`)
out.push(`${fieldType.description}\n`)
out.push(renderConstants(fieldType.oneOf))
out.push('')

// Per-type conditional properties, from the field's allOf if/then blocks.
out.push(`### Per-type properties\n`)
out.push(
  `Some properties only exist on some types. The schema states these as conditional blocks; they are listed here per type.\n`,
)
for (const block of field.allOf ?? []) {
  const condition = block.if?.properties?.type
  const types = condition?.enum ?? (condition?.const !== undefined ? [condition.const] : [])
  const label = types.map((type) => `\`${type}\``).join(', ')

  const { node: thenNode, refName } = deref(block.then ?? {})
  if (refName === 'containerField') {
    // The container/leaf split: containers get `fields`, everything else is a leaf.
    const leaf = deref(block.else ?? {}).node
    out.push(`#### Containers: ${label}\n`)
    out.push(`${thenNode.description}\n`)
    out.push(renderProperties(thenNode, '#####'))
    if (leaf?.description !== undefined) {
      out.push(`Every other type is an answer field: ${leaf.description.charAt(0).toLowerCase()}${leaf.description.slice(1)}\n`)
    }
    continue
  }

  if (thenNode.properties === undefined) continue
  out.push(`#### ${label}\n`)
  out.push(renderProperties(thenNode, '#####'))

  // A conditional property may itself be a closed list (text/textarea `format`).
  for (const [name, child] of Object.entries(thenNode.properties)) {
    const resolved = deref(child).node
    if (Array.isArray(resolved.oneOf) && resolved.oneOf.every((branch) => branch.const !== undefined)) {
      out.push(`Values of \`${name}\`:\n`)
      out.push(renderConstants(resolved.oneOf))
      out.push('')
    }
  }
}

// ----------------------------------------------------------------- the logic
const logicRule = defs.logicRule
out.push(`## Logic rules\n`)
out.push(`${defs.logic.properties.rules.description}\n`)
out.push(`### Properties of a rule\n`)
out.push(`${logicRule.description}\n`)
out.push(renderProperties(logicRule))
out.push(`### Rule kinds\n`)
out.push(renderConstants(deref(logicRule.properties.kind).node.oneOf))
out.push('')

// ----------------------------------------------------- the named definitions
const rendered = new Set(['field', 'fieldType', 'logic', 'logicRule', 'leafField', 'containerField'])
out.push(`## Named definitions\n`)
out.push(`The remaining definitions the properties above refer to.\n`)
for (const [name, def] of Object.entries(defs)) {
  if (rendered.has(name)) continue
  out.push(`### ${def.title ?? name}\n`)
  const facts = constraints(def)
  if (facts.length > 0) out.push(`${facts.join(' · ')}\n`)
  if (def.description !== undefined) out.push(`${def.description}\n`)
  if (def.properties !== undefined) out.push(renderProperties(def, '####'))
  if (Array.isArray(def.examples) && def.examples.length > 0) {
    out.push(`Examples: ${def.examples.map((example) => `\`${JSON.stringify(example)}\``).join(', ')}\n`)
  }
}

const markdown = out.join('\n').replaceAll(/\n{3,}/g, '\n\n')
mkdirSync(dirname(fileURLToPath(OUTPUT_URL)), { recursive: true })
writeFileSync(OUTPUT_URL, markdown)
console.log(`spec reference: wrote ${fileURLToPath(OUTPUT_URL)} from ${fileURLToPath(SCHEMA_URL)}`)
