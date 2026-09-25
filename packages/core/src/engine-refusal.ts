import type { FormSchema } from '@formancy/spec'
import type { CapabilitySource } from '@formancy/expressions'
import { createFormEngine } from './engine.js'

/**
 * Why the engine would refuse to open this document — or undefined, when it
 * would open it.
 *
 * **The problem this exists for.** The engine compiles a document before it
 * evaluates anything, and refuses one whose logic cannot work: an expression
 * that does not parse or type-check, a rule reading a field that is not there,
 * a condition that is not certain to produce a bool, a cycle between computed
 * fields. The server's publish gate asks that question by building an engine.
 * Everything that checked a document *without* building one — `validate_form`
 * in the MCP server, the builder's authoring loop — did not ask it at all, so
 * both called a document valid that the server then refused and no renderer
 * could open. A model that mistyped one field name was told its form was
 * fine.
 *
 * **Why it builds an engine.** Not a second implementation of the engine's
 * checks: a second implementation is a second opinion, and the whole defect
 * was two opinions. This is the same compile the server and every renderer
 * run, so it cannot disagree with them.
 *
 * Structural validity is the caller's to establish first, with
 * `validateSchema` — the engine assumes a well-formed document, and its
 * refusal of a malformed one would be a worse message than the validator's.
 */
export function engineRefusal(schema: FormSchema): string | undefined {
  try {
    createFormEngine({ schema, capabilities: INERT })
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/**
 * Capabilities for an engine that is built to be refused or not, and then
 * thrown away. The engine insists on a source whenever a document has rules,
 * because a form must never read the clock ambiently; nothing here is ever
 * shown to anybody, so any fixed values do.
 */
const INERT: CapabilitySource = {
  now: () => 0,
  today: () => '1970-01-01',
  random: () => 0,
}
