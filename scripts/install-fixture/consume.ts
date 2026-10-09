/**
 * One import per package, each of which USES what it imported.
 *
 * Importing a name and discarding it proves the module resolved; calling it
 * proves the entry point is the real thing rather than a stub that happened to
 * parse. `skipLibCheck: false` in the generated tsconfig is what makes the type
 * imports count too.
 *
 * A real file on disk rather than a string inside the runner. Written as a
 * template literal first, and three layers of escaping — a backtick inside a
 * template literal inside a script edited by a script — broke it twice before it
 * ran once. A fixture that can be opened, type-checked and linted in place is
 * also one somebody can extend without reading the runner.
 */
import { CURRENT_SPEC_VERSION, DECLINE_KEY, modelDataPaths } from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'
import schemaJson from '@formancy/spec/schema.json'
import { parse, referencedPaths, rewritePath } from '@formancy/expressions'
import { createFormEngine, expressionProblems, unknownReferences } from '@formancy/core'
import {
  authorForm,
  builderView,
  createBuilderSession,
  createStop,
  declinedAnswer,
} from '@formancy/builder-core'
import type { AskModel } from '@formancy/builder-core'
import { mintChallenge, solveChallenge, verifySolution } from '@formancy/challenge'
import { auditedBy, createMemoryStorage, publishForm } from '@formancy/server-core'
import type { FormSchema } from '@formancy/spec'

const schema = {
  specVersion: CURRENT_SPEC_VERSION,
  id: 'installed',
  title: 'Installed',
  model: { fields: [{ key: 'email', type: 'text', label: 'Email', required: true }] },
} as unknown as FormSchema

// The spec: validate, enumerate, and read the schema document through its own
// exports map — a separate entry point, and the one most likely to be missing
// from `files`.
if (!validateSchema(schema).valid) throw new Error('the installed spec refused its own fixture')
if (modelDataPaths(schema.model).length !== 1) throw new Error('modelDataPaths is wrong')
if (typeof (schemaJson as { $id?: unknown }).$id !== 'string') {
  throw new Error('the JSON Schema did not come through the exports map')
}

// Expressions: parse, read and rewrite.
const parsed = parse('email != ""')
if (!parsed.ok) throw new Error('the installed parser refused a valid expression')
if (referencedPaths(parsed.ast)[0] !== 'email') throw new Error('referencedPaths is wrong')
const rewritten = rewritePath('email != ""', 'email', 'work')
if (!rewritten.ok || rewritten.source !== 'work != ""') throw new Error('rewritePath is wrong')

// The engine: build one and ask it something whose answer is exact.
const engine = createFormEngine({
  schema,
  capabilities: { now: () => 0, today: () => '2026-10-04', random: () => 0.5 },
})
if (engine.getFieldSnapshot(['email']).ids.control !== 'f:installed:email:control') {
  throw new Error('the installed engine mints different ids')
}
if (expressionProblems(schema).length !== 0) throw new Error('expressionProblems is wrong')
if (unknownReferences(schema).length !== 0) throw new Error('unknownReferences is wrong')

// The builder core: open a session over the same document.
const session = createBuilderSession(schema)
if (builderView(session).nodes.length !== 1) throw new Error('builderView is wrong')

// A model's run, through the published types (0157). An `AskModel` written with one
// parameter, as every host's was before the second existed, still compiles against
// them, and a stop ends a run whose model never answers.
const neverAnswers: AskModel = ({ user }) => new Promise<string>(() => void user)
const stop = createStop()
const running = authorForm(neverAnswers, 'a contact form', { stop })
stop.stop()
const ended = await running
if (ended.ok || ended.ended !== 'stopped') throw new Error('the installed authorForm did not stop')

// A decline (0158): a host maps its model service's own refusal onto the answer the
// briefing offers, spelled with the spec's key, and the run ends on the first turn.
const refuses: AskModel = () => Promise.resolve(declinedAnswer('The model service refused.'))
const declined = await authorForm(refuses, 'email me every submission')
if (declined.ok || declined.ended !== 'declined' || declined.attempts !== 1) {
  throw new Error('the installed authorForm did not end on a decline')
}
if (!(DECLINE_KEY in (JSON.parse(declinedAnswer('why')) as object))) {
  throw new Error('declinedAnswer and the spec disagree about the key')
}

/*
 * The challenge: mint, solve, verify — both halves of the protocol.
 *
 * The clock is injected, so this asserts an exact outcome rather than hoping
 * three calls land inside one TTL. `maxNumber` is small for the same reason the
 * package's own tests keep it small: proving the loop works does not need two
 * thousand hashes.
 */
const SECRET = 'a-secret-of-adequate-length'
const NOW_SECONDS = 1_760_000_000
const challenge = mintChallenge({ secret: SECRET, nowSeconds: NOW_SECONDS, maxNumber: 200 })
// `solveChallenge` returns the NUMBER it found; assembling the solution is the
// client's half, so writing it out exercises both rather than one call.
const found = await solveChallenge(challenge, {})
if (found === undefined) throw new Error('the installed challenge could not be solved')
const verdict = verifySolution(
  SECRET,
  {
    salt: challenge.salt,
    number: found,
    challenge: challenge.challenge,
    signature: challenge.signature,
  },
  NOW_SECONDS,
)
if (!verdict.ok) throw new Error('the installed challenge refused its own solution')

// The server core: publish into memory storage, and stamp an audit draft.
let counter = 0
const outcome = await publishForm(
  {
    storage: createMemoryStorage(),
    newId: () => `id-${String(++counter)}`,
    draftSecret: 'a-test-signing-key-of-adequate-length',
    capabilities: { now: () => 0, today: () => '2026-10-04', random: () => 0.5 },
    nowIso: () => '2026-10-04T00:00:00Z',
  },
  { path: 'installed', schema },
)
if (!outcome.ok) throw new Error('the installed server core refused a valid publish')
if (outcome.version !== 1) throw new Error('the installed publish did not create version 1')

const audited = auditedBy({ kind: 'user', id: 'u-1', role: 'admin' }, { action: 'form.published' })
if (audited.actorKind !== 'user' || audited.actorId !== 'u-1') {
  throw new Error('auditedBy did not stamp the actor onto the draft')
}

console.log('every installed package resolved, type-checked and ran')
