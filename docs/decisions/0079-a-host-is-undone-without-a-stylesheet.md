# 0079 — A host element is undone without a stylesheet

- **Status:** accepted
- **Date:** 2026-09-28
- **Supersedes:** [0073](0073-a-host-element-is-not-a-layout.md) — the decision stands,
  the mechanism does not
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/angular/src/layout.test.ts`, *'and it needs no stylesheet to
  do it, so a strict style-src needs no nonce'* — no injected `<style>` mentions the
  declaration and the host still computes `display: contents`. Observed failing against
  the component style it replaced. Generalised in `apps/docs/src/themes.test.ts`, *'no
  package below the theme layer ships CSS, in a file or in a decorator'*, which was also
  watched failing with the style put back.

## Context

[0073](0073-a-host-element-is-not-a-layout.md) found that Angular's `<formancy-layout>`
host element was the only grid item its parent had, so a two-column table layout had never
produced two columns in that renderer. The fix was `display: contents` on the host, shipped
as a component style:

```ts
styles: ':host { display: contents }',
```

0073 chose that over the alternative it wrote down as `host: { style: 'display: contents' }`,
and the reason it gave was CSP:

> Rejected because an inline style is *worse* under a strict CSP than a stylesheet:
> `style-src` with a nonce covers the `<style>` Angular emits, while a style attribute
> needs `'unsafe-inline'` or `'unsafe-hashes'`.

Both halves of that sentence are true and the conclusion is still wrong, because of the
five words in the middle: **with a nonce.** A nonce is configuration. The product's
headline — repeated in `SAFETY-ANALYSIS.md` and in the logic documentation — is that
formancy "runs under a strict CSP with **no configuration**", and this renderer did not.
Under `style-src 'self'` the injected `<style>` is blocked, the host keeps `display: block`,
and 0073's bug returns with nothing failing anywhere: jsdom has no layout, and the guard
0073 wrote asks `getComputedStyle`, which cannot tell a blocked stylesheet from an absent
one.

0073 compared two options and there were three. CSP governs **parsed markup** — a `style`
attribute in HTML, a `<style>` element, a `setAttribute('style', …)`. It does not govern
CSSOM. `element.style.setProperty('display', 'contents')` is subject to no directive at
all, which is why every framework's style *bindings* work under a strict CSP while an
inline style attribute does not.

## Decision

**The layout component sets `display: contents` on its own host in its constructor,
through CSSOM.** No component style, no stylesheet, no nonce, no directive.

```ts
constructor() {
  inject(ElementRef<HTMLElement>).nativeElement.style.setProperty('display', 'contents')
}
```

**And the "no CSS below the kit" rule is restored rather than amended.** 0073 recorded a
deliberate amendment to [0008](0008-layered-packages.md) to allow this one declaration.
There is now nothing to allow: `@formancy/angular` ships no stylesheet, in a file or in a
decorator, and a guard says so for every package below the kit. That is a better outcome
for a rule about who owns appearance than an exception with a good reason.

## Consequences

**The headline is true for both renderers now**, and it is checked in two places rather
than asserted in three documents. The claim was the thing at stake: a strict CSP with no
configuration is a hard requirement for the banking and government buyers this product is
positioned at, and "except set a nonce, or the Angular grid silently stops working" is not
that claim.

**A consumer can no longer override the declaration from a stylesheet.** An element style
beats any rule that is not `!important`. Nobody should want to override it — the host has
no role, names nothing, and exists only because Angular requires a component to have an
element — but it is a real loss of a real escape hatch, and `!important` is what is left.

**It runs once per layout container instead of once per document.** A form with fifty
containers performs fifty property writes, in constructors, before first paint. Measured
against nothing, because a `setProperty` call is not a cost worth measuring next to the
component instantiation that surrounds it.

**The `ng-template` recursion 0073 called "the structurally correct answer" is still
worth revisiting**, and is now worth slightly less: its advantage was shipping no CSS, and
this ships none either. What remains is the host element itself, which costs an element per
container in the tree.

## Alternatives considered

**Document the nonce requirement instead**, and soften the headline to "a strict CSP, with
`style-src` allowing a nonce for the Angular renderer". Honest, and it was the fallback.
Rejected because the requirement is avoidable in one line, and a documented exception to a
headline is an exception every evaluator finds.

**`host: { '[style.display]': "'contents'" }`** — a host binding rather than a constructor
write. The same CSSOM mechanism through Angular's own binding, and it would have been
equally correct. Rejected for being a string of code inside a decorator string, which is
the one place in an Angular component that nothing type-checks.

**Keeping the component style and adding `CSP_NONCE` documentation for consumers.** This
is what Angular offers for exactly this problem, and it works. Rejected on the same ground
as the first alternative: it is configuration, and the whole point of this record is that
there is none.

**Reverting to `display: block` and telling consumers to style `formancy-layout`
themselves.** Rejected in 0073 and still rejected: it puts a framework-specific element
name into every consumer's stylesheet, and cannot help the consumer who styles their own
design system and never reads our themes.
