<!-- Part of formancy: https://github.com/sharkysan/formancy.ai -->

# @formancy/core

The headless form engine: one build that runs unchanged in a browser and on a
server, so client and server can never disagree about what a form means.

No framework imports, no DOM, no Node globals. The absence of `@types/node` is
deliberate — it makes the typecheck enforce the constraint instead of a reviewer
having to.

## Two load-bearing decisions

**Snapshots are identity-stable.** `getFieldSnapshot(path)` returns the same
frozen object until that field's value, visibility, requiredness, touched state
or errors actually change. That is what lets React's `useSyncExternalStore` and
Angular's zoneless change detection work with no memoisation on the consumer's
side: a keystroke on a five-thousand-field form re-renders exactly the fields it
touched. (Measured: ~0.4 ms of engine work per keystroke at that size.)

**Failure direction is chosen per concern.** Compilation failures — an
unparseable expression, a ghost field reference, a dependency cycle — are
refused when the engine is built, so a broken form never reaches a person.
Evaluation failures during typing are normal, and there metadata fails **open**
(a broken visibility rule shows the field, rather than silently swallowing what
someone typed) while validation fails **closed** (a rule that cannot evaluate
cannot vouch for the value).

## Use

```ts
import { createFormEngine } from '@formancy/core'

const engine = createFormEngine({
  schema,
  capabilities: { now: Date.now, today: () => '2026-09-20', random: Math.random },
})

engine.subscribeField(['email'], () => render())
engine.setValue(['email'], 'someone@example.com')
const { value, errors, props, ids } = engine.getFieldSnapshot(['email'])
const outcome = engine.submit()
```

The engine also mints accessibility ids and composes `aria-describedby`
centrally, so every renderer emits identical wiring rather than three teams
each getting it nearly right.

Docs: `apps/docs`.
