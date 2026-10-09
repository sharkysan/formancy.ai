# 0103 — A theme editor edits what a theme declares, discovered from its stylesheet

- **Status:** accepted
- **Date:** 2026-10-06
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/playground/src/theme-tokens.test.ts` for the discovery rule,
  the value classification and the patch; `apps/playground/src/theme-editor.test.tsx`
  for the pane a visitor meets. Eleven mutations were applied; the three that first
  survived are the interesting ones and each produced a change rather than a new
  assertion. `pnpm test:browser` carries the half jsdom cannot judge: that an override
  reaches a rendered control's computed colour and that resetting gives the theme back
  ([0102](0102-what-jsdom-cannot-see-is-checked-in-a-browser.md)).

## Context

A comparison against SurveyJS put a visual theme editor first among the gaps, and it is
the right place in the order for a reason the comparison did not give: **it is the only
high-visibility item on that list with no spec cost at all.** Themes are strictly
downstream and never a dependency ([§8.7](../architecture/08-crosscutting-concepts.md)),
so nothing about this touches the frozen document format.

The obvious shape — controls for colours, fonts, spacing, borders and density, as
SurveyJS has — does not fit, and finding out why took one measurement. **The four
shipped themes do not share a token vocabulary:**

| theme | its own names |
|---|---|
| `blueprint` | `--fm-ink`, `--fm-paper`, `--fm-chrome`, `--fm-rule` |
| `dusk` | `--fm-ground`, `--fm-raised`, `--fm-inset`, `--fm-edge`, `--fm-control` |
| `pop` | `--fm-yellow`, `--fm-pink`, `--fm-blue`, `--fm-mint`, `--fm-line`, `--fm-lift` |
| `paper` | `--fm-hair`, `--fm-accent`, `--fm-serif`, `--fm-line-height` |

Five names are common to all four. That is deliberate: §8.7 says the shipped themes are
*different design languages rather than palette swaps*, "because that is what falsifies
the headless claim. If either had required a component change, the claim would be
false." A fixed set of controls would therefore be wrong for three of the four, and
making them fit would mean flattening the property that makes them worth shipping.

## Decision

**The editor reads the tokens a theme declares, out of the live stylesheet, and offers
one control each.**

- **Discovered through CSSOM**, by walking `document.styleSheets`. The side effect is
  the better feature: it works on a theme somebody else wrote, with no registration
  step and no build-time list — which a fixed set of controls cannot do at all.
- **A theme-level token is one declared on the theme's own selector and nothing
  narrower.** The discriminator is the *shape of the selector*, not a list of names to
  exclude. Measured: `blueprint` declares fourteen `--fm-*` properties in Chromium, and
  two are `--fm-columns` and `--fm-datagrid-count`, set on `[data-columns='3']` so a
  layout can read its own column count. Offering those would be offering to break the
  grid. Fifty-eight such declarations across the shipped themes are rejected by it.
- **Every selector on a rule must be a theme root**, not just one of them: a rule
  reading `[data-formancy-theme='a'], [data-formancy-theme='a'] [part='field']`
  declares its properties for both, so taking the first match would attribute a scoped
  declaration to the theme.
- **The control follows the value's shape**: a colour gets a picker *and* a text field,
  a length and a number get a field, everything else gets a field. `text` is the honest
  answer for a font stack, a border shorthand or a shadow — a picker that could express
  only part of such a value would destroy the rest of it the first time somebody
  touched it.
- **A bare number is not a length.** `--fm-columns` is a count, and appending `px` to
  it produces a grid template that silently computes nothing.
- **The value a control opens at comes from `getComputedStyle`, not from the rule.**
  What a rule *declares* and what the browser *resolved* are different questions, and
  the second is the one the editor has to open with: `dusk` declares `--fm-control`
  twice, and a theme of somebody else's may declare a token inside
  `@media (prefers-color-scheme: dark)`.
- **An override is a custom property set inline on the themed host**, which is the
  lesson from the pane template ([0100](0100-a-pane-boundary-is-dragged.md)): set the
  variable and leave the declarations to the cascade. Setting a resolved property would
  beat the theme's own rules for every element below, including the ones that compute
  from the token.
- **What comes out is a patch, not a fork.** Only the tokens that were changed, sorted.
  A full dump would pin every value, so the next release of `@formancy/themes` would
  change nothing for whoever pasted it in.

**In the playground, as a third editor mode beside Build and Schema.** Not a fourth
pane: the editor pane already switches modes, theming is an authoring concern, and a
new pane would have meant new splitters and a new fold target for something that is not
a different subject.

## Consequences

**It does not persist, and the admin does not have it yet.** Nothing in the playground
persists — not the theme, the locale or the demo — and one setting that did would be the
odd one out. What a visitor leaves with is a CSS file. A form author editing a *stored*
theme is a different feature with a different home: it needs somewhere to put the
result, which means a table, a route and a decision about whether a theme belongs to a
form, a deployment or an account. None of that is answered here, and answering it badly
would be worse than the file. The logic lives in two files that would move whole.

**A theme can hide a token from the editor by scoping it, and cannot opt one in.** The
rule is the selector's shape, so a theme that wants a token editable declares it on its
root, which is where a design token belongs anyway. There is no annotation and no
opt-out list — a theme that declares plumbing on its root will see it offered, and the
answer is to scope the plumbing.

**Walking every rule in every stylesheet is ~1,800 rules in the playground.** Done once
per theme rather than per render: the set of *names* a theme declares cannot change
while the page is open, and only the values can, which is what the computed read is
for.

**A cross-origin stylesheet is invisible.** `cssRules` throws on one and the editor
steps over it. Measured: the playground loads two — Google Fonts. A theme served from
another origin cannot be edited here, which is a real limit and an acceptable one,
since it also cannot be read by anything else in the page.

> **Amended by [0154](0154-the-website-makes-no-request-to-any-other-site.md).** The
> playground no longer loads Google Fonts: it serves its own faces, so none of its own
> stylesheets is cross-origin. The editor still steps over one, because a host's page that
> takes a webfont from a font service still has them.

**A blank is kept in the editor's map and counts for nothing.** Dropping the key on the
first empty keystroke made the field fall straight back to the theme's value, so
clearing a control and retyping appended to it — `#17222e` became `#17222e#ff0000`.
Found by a test doing what a person does.

**One safeguard was removed for being inert.** The overrides were filtered before being
set on the element, and a mutation run showed the suite green without that filter:
CSSOM discards a whitespace-only custom-property value and trims a padded one by
itself, measured in jsdom and in Chromium. The filter remains where `exportCss` and the
changed count depend on it and have cases that fail without it. An unreached branch
that looks like a safeguard is worse than its absence, because the next reader budgets
for it.

**`app.tsx` went over its size ceiling again and the editor pane left.** The budget was
pointing at something real for the second time: that file was holding a mode, three
bodies and a Monaco palette, none of which the page around it reads. Its ceiling is
down from 582 to 547.

## Alternatives considered

**A shared token contract every theme must declare.** The version that allows a fixed
set of controls, and the one SurveyJS can have because it ships one theme engine.
Rejected because it contradicts §8.7 directly: the shipped themes differ in order to
prove the renderers are not styling anything, and giving them a common vocabulary would
remove that evidence. It would also still fail for a consumer's own theme, which is the
case this project exists for.

**A build-time list generated from the theme files.** Would avoid the CSSOM walk and
could be checked by a test like the SOUP table is. Rejected because it cannot see a
theme that is not in this repository, which is most of them — and the walk is a few
milliseconds once.

**Editing the stylesheet text.** A textarea with the theme's CSS in it, which is
honest and needs no discovery at all. Rejected as not being the feature: the gap is a
*visual* editor, and somebody who wants to write CSS already can.

**Putting it in the admin first.** Where a form author works, and where it will have to
live if a theme is ever stored. Deferred rather than rejected: the admin has no answer
yet for *where a theme belongs*, and shipping the editor into the place an evaluator
actually opens is worth more today than shipping it behind a login with a storage model
chosen in a hurry.

**Pixel-diffing the result.** Tempting, since the feature is visual. Rejected for the
reason [0102](0102-what-jsdom-cannot-see-is-checked-in-a-browser.md) gives: what the
editor must get right is that an override reaches a computed value, which is a number,
and a baseline is a file somebody updates when it goes red.
