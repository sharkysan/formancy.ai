import type { LogicRule, Text } from '@formancy/spec'

/*
 * What each field's `validate` rules say for their codes, resolved once and looked up by the
 * rules' own target — `items[].qty` is every row's (0198).
 *
 * From the document rather than from what was evaluated: a rule that runs only on the server
 * reports its code to a browser that never ran it, and the message is said all the same. The
 * document's validator has already refused two rules on one field sharing a code with a
 * message, so each code here has one sentence.
 */
export function ruleMessages(
  rules: readonly LogicRule[],
  say: (text: Text) => string | undefined,
): (target: string) => Readonly<Record<string, string>> {
  const byTarget = new Map<string, Array<[string, string]>>()
  for (const rule of rules) {
    if (rule.kind !== 'validate' || rule.code === undefined || rule.message === undefined) continue
    const said = say(rule.message)
    if (said === undefined) continue
    byTarget.set(rule.target, [...(byTarget.get(rule.target) ?? []), [rule.code, said]])
  }
  const resolved = new Map([...byTarget].map(([target, said]) => [target, Object.freeze(Object.fromEntries(said))]))
  // One empty record for every field whose rules say nothing, so its snapshot keeps its identity.
  return (target) => resolved.get(target) ?? NONE
}

const NONE: Readonly<Record<string, string>> = Object.freeze({})
