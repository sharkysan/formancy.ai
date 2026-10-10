import { runScenarios } from '@formancy/core'
import type { Scenario, ScenarioOptions, ScenarioResult } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { askChecked } from './answers.js'
import type { AskModel, Checkable, Stop, Verdict } from './answers.js'
import type { BuilderMessageId, BuilderText } from './messages.js'
import { scenarioComplaint, scenarioPrompt } from './scenario-prompt.js'
import { readScenario } from './scenario-shape.js'
import type { ScenarioShapeReason } from './scenario-shape.js'

/**
 * Examples drafted by a model from what the author said, judged by the engine, and kept
 * one at a time by a person.
 *
 * An example with its answer written down is the only check that tells a working
 * condition from the one that was asked for
 * ([0110](../../../docs/decisions/0110-a-form-is-checked-against-examples.md)), the
 * scenario panes run them after every edit
 * ([0111](../../../docs/decisions/0111-a-scenario-panel-names-what-stopped-holding.md)),
 * and a model's edit is run against them before Apply
 * ([0159](../../../docs/decisions/0159-a-proposal-is-checked-against-the-forms-examples.md)).
 * Nothing wrote one: a form with none was a form all of that said nothing about.
 *
 * **Three decisions, once, for both builders**
 * ([0162](../../../docs/decisions/0162-an-example-is-drafted-from-what-the-author-said.md)):
 *
 * - **What the model sees** is `scenarioPrompt`: the fields and the author's words, never a
 *   rule. A model shown the rule writes an example that agrees with it.
 * - **What the engine makes of a draft** is `draftVerdict`, which is `runScenarios` with the
 *   pane's own options — so a draft that holds holds in the panel after Keep, and one that
 *   fails fails there in the same words. Recomputed whenever it is read, never stored: an
 *   edit to the form while a draft waits changes the verdict.
 * - **What may be kept** is `keepDraft`: not a name already taken, and not an example that
 *   names a field this form does not have, which would check nothing. **A draft that fails
 *   can be kept.** Failing is where a person decides whether the example or the rule is
 *   wrong, and only they can.
 *
 * No sentences here. The model is asked in `scenario-prompt.ts`'s English, and what a pane
 * says about a run is the catalogue's.
 */

/** Why one item of a model's answer could not be read as an example. */
export type UnusableReason = ScenarioShapeReason | 'name-taken' | 'name-repeated'

/** One item of the answer that is not an example, and why — for a pane to list, and a model to be told. */
export interface UnusableDraft {
  /** Where it stood in the answer's list, from 1. */
  readonly position: number
  /** Its name, when it has one that is a string. */
  readonly name?: string
  readonly reason: UnusableReason
  /** For `unknown-key` and `malformed`: the key. */
  readonly part?: string
}

/** Why an answer held nothing to keep, and the model is asked again. */
export type DraftProblem =
  | { readonly kind: 'not-json' }
  | { readonly kind: 'unexplained-decline' }
  | { readonly kind: 'no-list' }
  | { readonly kind: 'none-usable'; readonly unusable: readonly UnusableDraft[] }

export interface DraftingOptions {
  /** Where every example starts — the form's sample, as the scenario pane takes it. */
  readonly initialValue?: Readonly<Record<string, unknown>> | undefined
  /** The examples the form already has. Their names are taken. */
  readonly existing?: readonly Scenario[] | undefined
  /** How many times to ask. Three by default, as `authorForm`. */
  readonly attempts?: number | undefined
  /** The person's stop, from `createStop`. */
  readonly stop?: Stop | undefined
}

/** How a run of drafting ended. */
export type Drafted =
  | {
      readonly ok: true
      /** The examples read from the answer, in its order. None is kept yet. */
      readonly drafts: readonly Scenario[]
      /** The items that were not examples, with why. */
      readonly unusable: readonly UnusableDraft[]
      readonly attempts: number
    }
  | {
      readonly ok: false
      readonly attempts: number
      readonly problems: readonly DraftProblem[]
      readonly lastAnswer: string
      readonly ended: 'gave-up' | 'stopped' | 'unreachable' | 'busy' | 'declined'
      readonly reason?: string
    }

/**
 * Examples for `document`, drafted from `intent`.
 *
 * Asked again only when nothing in the answer can be read as an example: no object, no
 * list, or every item unusable. Otherwise **each item is read on its own**, and the ones
 * that are not examples are listed with why rather than costing the others — a model that
 * wrote five good examples and one with a typo has written five good examples. A decline
 * ends the run, as it does `authorForm`'s.
 */
export async function draftScenarios(
  ask: AskModel,
  document: FormSchema,
  intent: string,
  options: DraftingOptions = {},
): Promise<Drafted> {
  const existing = options.existing ?? []
  const prompt = scenarioPrompt(document, intent, {
    initialValue: options.initialValue,
    existing,
  })
  const taken = new Set(existing.map((scenario) => scenario.name))
  const asked = await askChecked(
    ask,
    (latest: DraftProblem | undefined) =>
      latest === undefined
        ? prompt
        : {
            ...prompt,
            user: [prompt.user, '', scenarioComplaint(latest)].join('\n'),
            followUp: scenarioComplaint(latest),
          },
    (answer) => readDrafts(answer, taken),
    {
      ...(options.attempts === undefined ? {} : { attempts: options.attempts }),
      ...(options.stop === undefined ? {} : { stop: options.stop }),
    },
  )
  return asked.ok ? { ok: true, ...asked.value, attempts: asked.attempts } : asked
}

interface Read {
  readonly drafts: readonly Scenario[]
  readonly unusable: readonly UnusableDraft[]
}

function readDrafts(answer: Checkable, taken: ReadonlySet<string>): Verdict<Read, DraftProblem> {
  if (answer === undefined) return { ok: false, problem: { kind: 'not-json' } }
  if (answer.kind === 'unexplained-decline') return { ok: false, problem: { kind: 'unexplained-decline' } }
  const list = (answer.value as { scenarios?: unknown }).scenarios
  if (!Array.isArray(list)) return { ok: false, problem: { kind: 'no-list' } }

  const drafts: Scenario[] = []
  const unusable: UnusableDraft[] = []
  const named = new Set<string>()
  list.forEach((item: unknown, index) => {
    const read = readDraft(item, index + 1, taken, named)
    if ('reason' in read) unusable.push(read)
    else {
      named.add(read.name)
      drafts.push(read)
    }
  })
  return drafts.length === 0
    ? { ok: false, problem: { kind: 'none-usable', unusable } }
    : { ok: true, value: { drafts, unusable } }
}

/**
 * One item, as an example or as why it is not one.
 *
 * Its shape is `readScenario`'s question, the one a server keeping a form's examples asks
 * too (0166), so an item read here as an example is one that server keeps. What is the
 * drafting's alone is the names: one taken by an example the form has, or repeated within
 * the answer, is ambiguous, because a scenario's name is how its result is found.
 */
function readDraft(
  item: unknown,
  position: number,
  taken: ReadonlySet<string>,
  named: ReadonlySet<string>,
): Scenario | UnusableDraft {
  const read = readScenario(item)
  if (!read.ok) return { position, ...read.problem }
  const { name } = read.scenario
  if (taken.has(name)) return { position, name, reason: 'name-taken' }
  if (named.has(name)) return { position, name, reason: 'name-repeated' }
  return read.scenario
}

/**
 * What the engine makes of a draft against `document`: `runScenarios`, with the options the
 * scenario pane runs its list with, so the verdict is the one the panel gives after Keep.
 */
export function draftVerdict(
  document: FormSchema,
  draft: Scenario,
  options: ScenarioOptions = {},
): ScenarioResult {
  return runScenarios(document, [draft], options)[0]!
}

/** What came of keeping a draft. */
export type KeptDraft =
  | { readonly ok: true; readonly scenarios: readonly Scenario[] }
  | { readonly ok: false; readonly refused: 'name-taken' | 'unknown-path' }

/**
 * The list with `draft` added, or why it may not be.
 *
 * A name already in the list is refused, which is also what stops one draft being kept
 * twice. So is a draft whose run fails because it names a path this form does not have:
 * it would set nothing and check nothing, and fail for a reason that is not about any rule.
 * A draft that fails for any other reason is kept — that failure is the question the
 * person is answering.
 */
export function keepDraft(
  document: FormSchema,
  scenarios: readonly Scenario[],
  draft: Scenario,
  options: ScenarioOptions = {},
): KeptDraft {
  if (scenarios.some((scenario) => scenario.name === draft.name)) {
    return { ok: false, refused: 'name-taken' }
  }
  if (draftVerdict(document, draft, options).failures.some((failure) => failure.about === 'path')) {
    return { ok: false, refused: 'unknown-path' }
  }
  return { ok: true, scenarios: [...scenarios, draft] }
}

/**
 * What a pane shows of a draft beside its name and reason: what it sets and what it says
 * should follow, as the model wrote it, for a person deciding whether the example is right.
 * One spelling for both builders, so a draft reads the same in either.
 */
export function draftExpectations(draft: Scenario): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(draft).filter(([key]) => key !== 'name' && key !== 'because')),
    null,
    2,
  )
}

/** What the last Keep or Discard came to, for the status to say. */
export type DraftNote =
  | { readonly kind: 'kept' | 'discarded'; readonly name: string }
  | { readonly kind: 'refused'; readonly why: 'name-taken' | 'unknown-path'; readonly name: string }

/** Everything the drafting part's live region speaks from. */
export interface DraftState {
  readonly busy: boolean
  readonly result: Drafted | undefined
  readonly note: DraftNote | undefined
}

/**
 * The one sentence a drafting part's live region carries, decided once for both builders.
 *
 * What a Keep or a Discard just did outranks what the run came to: it is about the press
 * somebody just made.
 */
export function draftStatus({ busy, result, note }: DraftState, text: BuilderText): string {
  if (busy) return text('drafts.status.writing')
  if (note?.kind === 'refused') {
    return note.why === 'name-taken'
      ? text('drafts.status.taken', { name: note.name })
      : text('drafts.status.unknownPath', { name: note.name })
  }
  if (note !== undefined) {
    return text(note.kind === 'kept' ? 'drafts.status.kept' : 'drafts.status.discarded', { name: note.name })
  }
  if (result === undefined) return ''
  if (result.ok) {
    const ready = text('drafts.status.ready', { count: result.drafts.length })
    return result.unusable.length === 0
      ? ready
      : `${ready} ${text('drafts.status.unusable', { count: result.unusable.length })}`
  }
  switch (result.ended) {
    case 'stopped':
      return text('drafts.status.stopped')
    case 'declined':
      return text('drafts.status.declined')
    case 'unreachable':
      return result.reason === undefined
        ? text('drafts.status.unreachableNoReason')
        : text('drafts.status.unreachable', { reason: result.reason })
    case 'busy':
      return text('drafts.status.busy')
    case 'gave-up':
      return text('drafts.status.failed', { count: result.attempts })
  }
}

/**
 * What to list beneath the status: the items an answer held that were not examples, or —
 * when no answer held one — what was wrong with the last.
 */
export function draftProblems(result: Drafted | undefined, text: BuilderText): string[] {
  if (result === undefined) return []
  if (result.ok) return result.unusable.map((item) => unusableSentence(item, text))
  if (result.ended !== 'gave-up') return []
  const last = result.problems.at(-1)
  if (last === undefined) return []
  switch (last.kind) {
    case 'not-json':
      return [text('drafts.problem.notJson')]
    case 'unexplained-decline':
      return [text('drafts.problem.unexplained')]
    case 'no-list':
      return [text('drafts.problem.noList')]
    case 'none-usable':
      return last.unusable.length === 0
        ? [text('drafts.problem.empty')]
        : last.unusable.map((item) => unusableSentence(item, text))
  }
}

/** The model's own words a drafting part shows, quoted as text beneath its status. */
export interface DraftQuotes {
  /** Why it declined, as it wrote it. The status says that it declined, never why. */
  readonly declined: string | undefined
  /** What it last answered, when no answer held an example: what the problems listed are about. */
  readonly lastAnswer: string | undefined
}

/**
 * Which of the model's words a drafting part quotes, decided once for both builders. Each
 * part decided it for itself, and either could drop the quote with nothing failing.
 */
export function draftQuotes(result: Drafted | undefined): DraftQuotes {
  if (result === undefined || result.ok) return { declined: undefined, lastAnswer: undefined }
  return {
    declined: result.ended === 'declined' ? result.reason : undefined,
    lastAnswer: result.ended === 'gave-up' && result.lastAnswer !== '' ? result.lastAnswer : undefined,
  }
}

const REASON_IDS = {
  'not-an-object': 'drafts.reason.notAnObject',
  'unknown-key': 'drafts.reason.unknownKey',
  'no-name': 'drafts.reason.noName',
  'name-taken': 'drafts.reason.nameTaken',
  'name-repeated': 'drafts.reason.nameRepeated',
  'no-changes': 'drafts.reason.noChanges',
  'no-verdict': 'drafts.reason.noVerdict',
  malformed: 'drafts.reason.malformed',
} as const satisfies Record<UnusableReason, BuilderMessageId>

function unusableSentence(item: UnusableDraft, text: BuilderText): string {
  const which = item.name ?? text('drafts.item', { position: item.position })
  return text(REASON_IDS[item.reason], { item: which, part: item.part ?? '' })
}
