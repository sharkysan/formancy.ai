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
  applyProposal,
  authorForm,
  builderView,
  createBuilderSession,
  createDraftRun,
  createPromptRun,
  createRelay,
  createStop,
  createTranslationRun,
  declinedAnswer,
  draftScenarios,
  draftVerdict,
  draftsOn,
  keepDraft,
  ModelBusyError,
  proposalHeading,
  proposeEdit,
  proposeTranslation,
  relayMessage,
  translateCatalogue,
  translationOn,
  translationPrompt,
  translationStatus,
} from '@formancy/builder-core'
import type {
  AskModel,
  DraftRun,
  PromptRun,
  ProposalExamples,
  TranslationProposal,
  TranslationRun,
  TranslationView,
} from '@formancy/builder-core'
import type { BuiltInErrorCode } from '@formancy/core'
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

// A proposal against the form's examples (0159): the installed builder-core runs them
// through the installed core, and the review's heading names the one that would stop.
const optional = {
  ...schema,
  model: { fields: [{ key: 'email', type: 'text', label: 'Email' }] },
} as unknown as FormSchema
const examples: ProposalExamples = {
  scenarios: [{ name: 'an email is needed', changes: {}, valid: false, errors: { email: ['required'] } }],
}
const proposal = proposeEdit(schema, optional, examples)
if (proposal.examples?.regressions[0] !== 'an email is needed') {
  throw new Error('the installed proposeEdit did not run the examples')
}
if (!proposalHeading(proposal, session.text).includes('an email is needed')) {
  throw new Error('the installed proposalHeading did not name the example')
}

// A relay (0160): a person carries the turn, so the host's model is the relay's `ask`.
// The turn waiting is the prompt, a paste with no object in it is held back without
// costing an attempt, and a working one ends the run with the document.
const relay = createRelay()
const relayed = authorForm(relay.ask, 'add a phone number', { current: schema })
const turn = relay.waiting()
if (turn === undefined || turn.message !== relayMessage(turn.prompt)) {
  throw new Error('the installed relay shows no turn, or not the one asked')
}
if (relay.answer('Sure, here it is.') !== 'no-object' || relay.waiting() !== turn) {
  throw new Error('the installed relay let a paste with no object through')
}
relay.answer(JSON.stringify(schema))
const carried = await relayed
if (!carried.ok || carried.attempts !== 1) throw new Error('the installed relay did not end the run')

// A run the host holds (0163): outside any pane, so a turn carried through the relay is
// still held when nothing is listening, and lands through Apply in one step.
const run: PromptRun = createPromptRun()
const holding = createBuilderSession(schema)
const holdingRelay = createRelay()
const listening = run.subscribe(() => undefined)
run.instruct('add a phone number')
const writing = run.write(holdingRelay.ask, holding)
listening()
holdingRelay.answer(
  JSON.stringify({
    ...schema,
    model: { fields: [...schema.model.fields, { key: 'phone', type: 'text', label: 'Phone' }] },
  }),
)
await writing
if (run.state().proposal === undefined || run.apply(holding)?.ok !== true || holding.revision() !== 1) {
  throw new Error('the installed createPromptRun did not hold the answer for Apply')
}

// A model asked for what a language is missing (0161): the request names the one message
// with no German, the answer lands through the import as a proposal, and applies in one step.
const worded = {
  ...schema,
  model: { fields: [{ key: 'email', type: 'text', label: { $t: 'email' } }] },
  i18n: { defaultLocale: 'en', messages: { en: { email: 'Email' }, de: {} } },
} as unknown as FormSchema
if (translationPrompt(worded, 'de').rows.map((row) => row.id).join() !== 'email') {
  throw new Error('the installed translationPrompt did not ask for the missing message')
}
const german = await translateCatalogue(
  () =>
    Promise.resolve(
      JSON.stringify({
        locale: 'de',
        defaultLocale: 'en',
        messages: [{ id: 'email', source: 'Email', target: 'E-Mail' }],
      }),
    ),
  worded,
  'de',
)
if (!german.ok) throw new Error('the installed translateCatalogue refused a catalogue for the language asked')
const translating = createBuilderSession(worded)
const translation: TranslationProposal = proposeTranslation(translating, german.answer)
if (!applyProposal(translating, translation).ok || translating.document().i18n?.messages['de']?.['email'] !== 'E-Mail') {
  throw new Error('the installed proposeTranslation did not apply')
}

// Examples drafted from what the author said (0162): the request withholds the rule, a
// draft that fails is judged by the installed core and can still be kept, and the codes
// a model is told are a type the installed core exports.
const drafting = createRelay()
const drafted = draftScenarios(drafting.ask, schema, 'An email is optional.')
const asked = drafting.waiting()
if (asked === undefined || !asked.prompt.user.includes('An email is optional.')) {
  throw new Error('the installed draftScenarios did not ask for the author’s words')
}
const required: BuiltInErrorCode = 'required'
drafting.answer(JSON.stringify({ scenarios: [{ name: 'no email is fine', changes: {}, valid: true }] }))
const draftsOut = await drafted
if (!draftsOut.ok || draftsOut.drafts[0]?.name !== 'no email is fine') {
  throw new Error('the installed draftScenarios did not read the draft')
}
const failing = draftVerdict(schema, draftsOut.drafts[0])
if (failing.passed || !failing.failures.some((failure) => failure.detail.includes(required))) {
  throw new Error('the installed draftVerdict did not judge the draft against the required email')
}
const keptDraft = keepDraft(schema, [], draftsOut.drafts[0])
if (!keptDraft.ok || keptDraft.scenarios.length !== 1) throw new Error('the installed keepDraft refused a failing draft')

// A translation and drafts the host holds (0164): each outlives what listened to it, the
// translation is drawn only under its language — and, once that language has left the form,
// said to have gone everywhere — and the drafts over any session of their form.
const heldTranslation: TranslationRun = createTranslationRun()
const translationRelay = createRelay()
const hearing = heldTranslation.subscribe(() => undefined)
const translatingHeld = heldTranslation.translate(translationRelay.ask, createBuilderSession(worded), 'de')
hearing()
const pasted = translationRelay.answer(
  JSON.stringify({ locale: 'de', defaultLocale: 'en', messages: [{ id: 'email', source: 'Email', target: 'E-Mail' }] }),
)
await translatingHeld
const underGerman = translationOn(heldTranslation.state(), 'de', worded)
const underEnglish: TranslationView = translationOn(heldTranslation.state(), 'en', worded)
if (pasted !== 'accepted' || underGerman.proposal === undefined || underEnglish.elsewhere?.locale !== 'de') {
  throw new Error('the installed createTranslationRun did not hold the German for German alone')
}
const germanGone = { ...worded, i18n: { defaultLocale: 'en', messages: { en: { email: 'Email' } } } } as FormSchema
if (translationOn(heldTranslation.state(), 'en', germanGone).elsewhere?.gone !== true) {
  throw new Error('the installed translationOn did not say the German had left the form')
}
const heldDrafts: DraftRun = createDraftRun()
heldDrafts.describe('An email is optional.')
await heldDrafts.draft(
  () => Promise.resolve(JSON.stringify({ scenarios: [{ name: 'no email is fine', changes: {}, valid: true }] })),
  createBuilderSession(schema),
)
if (draftsOn(heldDrafts.state(), createBuilderSession(schema)).drafts.length !== 1) {
  throw new Error('the installed createDraftRun did not show its drafts over a new session of the form')
}

// One relay asked from several panes (0162): a second request while a turn waits ends busy,
// through the installed relay and askChecked — a draft's, and a translation's, whose status
// says it as the prompt pane does — and so does a host's own ModelBusyError.
const shared = createRelay()
const waitingEdit = authorForm(shared.ask, 'add a phone number', { current: schema })
const refusedDraft = await draftScenarios(shared.ask, schema, 'An email is optional.')
if (refusedDraft.ok || refusedDraft.ended !== 'busy') throw new Error('the installed relay did not refuse as busy')
const refusedTranslation = await translateCatalogue(shared.ask, worded, 'de')
if (refusedTranslation.ok || refusedTranslation.ended !== 'busy') {
  throw new Error('the installed relay did not refuse a translation as busy')
}
const english = translating.text
const saidBusy = translationStatus(
  { busy: false, result: refusedTranslation, proposal: undefined, refusal: undefined },
  english,
)
if (saidBusy !== english('prompt.status.busy')) throw new Error('the installed translationStatus did not say busy')
shared.answer(JSON.stringify(schema))
await waitingEdit
const ownBusy = await authorForm(() => Promise.reject(new ModelBusyError()), 'anything')
if (ownBusy.ok || ownBusy.ended !== 'busy') throw new Error('the installed ModelBusyError did not end the run busy')

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
