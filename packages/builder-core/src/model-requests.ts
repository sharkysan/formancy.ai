import { authoringBriefing } from '@formancy/spec'
import { scenarioBriefing } from './scenario-prompt.js'
import { translationBriefing } from './translate-prompt.js'

/**
 * The requests formancy makes of a model, by name, and the briefing each is asked under.
 *
 * **For a host that asks through its own server**, with the key kept there. Such a server
 * should answer formancy's requests and not be a way to ask the operator's paid model
 * anything at all, so it takes the request's kind and its user part from the browser, and
 * supplies the briefing itself: a system part sent by the browser is never read. The
 * browser finds the kind from the briefing the run handed its `AskModel`, so one ask
 * serves every pane, and a system part formancy did not write has no kind and is not sent
 * ([0166](../../../docs/decisions/0166-a-deployments-model-is-asked-through-its-server.md)).
 *
 * One table read by both ends, so the briefing the server pins cannot drift from the one
 * the run sends; `model-requests.test.ts` runs each kind's run and compares. A browser and
 * a server built from different versions can still disagree, and then the model is
 * briefed as the server's version briefs it.
 */
export const MODEL_REQUEST_KINDS = ['authoring', 'translation', 'scenarios'] as const

/** `authoring` is `authorForm`, `translation` is `translateCatalogue`, `scenarios` is `draftScenarios`. */
export type ModelRequestKind = (typeof MODEL_REQUEST_KINDS)[number]

const BRIEFINGS: Readonly<Record<ModelRequestKind, () => string>> = {
  authoring: authoringBriefing,
  translation: translationBriefing,
  scenarios: scenarioBriefing,
}

/** The system part a request of this kind is asked with. */
export function modelBriefing(kind: ModelRequestKind): string {
  return BRIEFINGS[kind]()
}

/**
 * Whether a value read from a request names a kind.
 *
 * By the list rather than by a lookup in the table, which would also find `constructor`
 * and `__proto__` on any object.
 */
export function isModelRequestKind(value: unknown): value is ModelRequestKind {
  return (MODEL_REQUEST_KINDS as readonly unknown[]).includes(value)
}

/**
 * The kind of request whose briefing `system` is, or `undefined` when formancy did not
 * write it — compared whole, so a briefing edited on the way is not one.
 */
export function modelRequestKind(system: string): ModelRequestKind | undefined {
  return MODEL_REQUEST_KINDS.find((kind) => modelBriefing(kind) === system)
}
