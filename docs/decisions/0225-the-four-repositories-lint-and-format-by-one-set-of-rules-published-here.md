# 0225 — The four formancy repositories lint and format by one set of rules, which this repository publishes as `@formancy/code-style` and is held to in CI; the change merges with a merge commit, so that blame can skip the format

- **Status:** accepted
- **Date:** 2026-10-30
- **Deciders:** Daniel Bacher
- **Verified by:** the guards and the two gate steps, on 30 October 2026, each watched failing
  first, every file a fault was planted in put back byte for byte:
  - **`packages/code-style/src/code-style.test.mjs`**, the package's suite in `pnpm test` —
    the shared rules, on a repository of real files it writes under the system's temporary
    directory: each rule at error on the kind of file it is for, and each path a repository
    passes doing what it says. Copied with the module from Formancy Health, where each case was
    watched failing
    ([formancy.ai-health 0017](https://github.com/sharkysan/formancy.ai-health/blob/main/docs/decisions/0017-every-typescript-and-javascript-file-is-linted-by-the-recommended-type-aware-rules-and-formatted-by-prettier.md)
    says how); here it failed whole before the package had a manifest. With `CI=true`, as
    GitHub Actions runs it, one case failed on 30 October 2026, *an async member that awaits
    nothing is not refused, and an un-awaited promise still is*: it lints a file twice in one
    process, which then gives no findings the second time (below). Its correction is made in
    Formancy Health's module and copied here, as every change to the rules is.
  - **`apps/docs/src/lint.test.ts`**, in `pnpm test` — this repository's wiring, derived from
    the files git holds and from the two recommended sets as ESLint computes them: every
    TypeScript and JavaScript file linted by `pnpm lint` as `eslint .`, by the rules its kind
    is held to and none at `warn`; every package's and app's tsconfig, and
    `tsconfig.tools.json`, one lint reads; every TypeScript file git holds in a program lint
    types it with, the Angular packages' tests among them; one `lint` command, at the root;
    every file resolving to the shared style; the format scripts naming a misformatted file of
    every extension git holds; and every `.gitignore` git holds read by both tools, which both
    leave the generated validator. Its seven cases failed before `eslint.config.mjs` existed,
    and the ignore case with `apps/docs/.gitignore` taken from ESLint's `ignoreFiles`, with
    `.prettierignore` emptied, with an entry added to `apps/docs/.gitignore` that
    `.prettierignore` did not repeat, and with the nested file handed to Prettier, whose
    patterns then reached the whole repository. Its case for the gate — `ci.yml`'s `verify`
    and `release.yml`'s `release` run `pnpm lint` and `pnpm format:check` after the build and
    the typecheck and before the tests — failed before either workflow ran them (`pnpm lint:
    expected -1 to be greater than 5`), with `pnpm lint` moved before the typecheck, with
    `pnpm format:check` moved after the tests, and with the build step renamed, which a step
    not found would otherwise pass. It hands ESLint no text but a file's own, and lints no
    file twice: GitHub Actions sets `CI=true`, and typescript-eslint then infers a single run,
    building each program once from the files on disk, so a text handed in for a path on disk
    is typed as the file there, and a file linted a second time in one process gives no
    findings (seen in formancy.ai-health's CI run 41045406900 on 30 October 2026). With
    `CI=true`, which reproduces that locally, its nine cases passed the same day.
  - **`scripts/install-fixture/lint.mjs`**, in `pnpm test:e2e:install` — the packed tarball,
    installed with its dependencies and the newest ESLint and Prettier its peers admit into a
    project outside the workspace, lints a floating promise with a type-aware rule and formats
    with the shared options. It failed four ways, with the file outside the project's tsconfig,
    marked untyped, formatted without the shared options, and with a dependency taken out of
    the tarball. The whole gate did not run on the machine this was made on, whose disk was
    full, so CI's `install` job is its first run.
  - **`pnpm lint` and `pnpm format:check`**, in CI's `verify` on every pull request and in the
    release before it publishes. With `Promise.resolve()` planted as a statement at the end of
    `packages/core/src/words.ts`, `pnpm lint` exited 1, naming
    `@typescript-eslint/no-floating-promises` at 417:1; with `export const planted = "x"`
    planted there instead, `pnpm format:check` exited 1, naming the file. The file was put back
    after each, its SHA-256 the same and `git diff --exit-code` clean.

  **Measured** on 30 October 2026, once each, after `pnpm build`, on an Apple M2 with 8 cores
  and 16 GB under macOS 26.5.2, with Node 22.23.3 and pnpm 12.4.2, while other work ran (a load
  average of 5.1): over the 942 TypeScript and JavaScript files git held, `pnpm lint` took
  26.4 s of wall time and `pnpm format:check` 6.2 s. Not measured on CI's runner.

  **Not mechanically enforced:** how the pull request that brings this merges, which GitHub
  leaves to the person merging; that a disable comment's reason is true; and that
  `packages/code-style/src` is Formancy Health's `scripts/code-style/` at `4f151a2`, and
  Formancy Data's copy the same, which `cmp` showed of all three on 30 October 2026 and
  nothing compares, since a test here cannot read another repository without the network.

## Context

formancy.ai had no linter and no formatter, and neither had Formancy Data, Formancy Report or
Formancy Health. Style was held by habit and review, and the mistakes only a type-aware linter
sees were caught by nobody. Three records said so:
"The repository has no linter at all" ([0008](0008-layered-packages.md)), "there is no ESLint
config, and `turbo run lint` matches no package script" ([0037](0037-turborepo-over-nx.md)),
and, rejecting `no-console`, "`pnpm lint` exists — but no CI gate runs it"
([0115](0115-a-library-writes-nothing-to-its-hosts-console.md)).

The maintainer asked on 30 October 2026 for a linter and a formatter in all four repositories,
which "should have the same quality": one set of rules. Formancy Health went first, with the
fewest findings and no pull request open, and wrote the rules as one module shaped as a package
this repository would publish (formancy.ai-health 0017); Formancy Data took a byte-for-byte copy
of it the same day
([formancy.ai-data 0114](https://github.com/sharkysan/formancy.ai-data/blob/main/docs/decisions/0114-every-typescript-and-javascript-file-is-linted-and-formatted-by-the-rules-the-four-repositories-share.md)).
This repository is the third, and the one the other three already depend on: each pins what
formancy.ai releases at an exact version and copies none of it. Formancy Report had neither tool
on 30 October 2026.

What was here differed from the other two in three ways the decision answers. It publishes
packages, so a module here is one more of them, released with the rest. Its Angular components
write their templates inline: Prettier's default formats code embedded in a string, and
formatting this repository reflowed those templates, where whitespace inside an element renders,
so that an option read " Deutsch " and five tests of `@formancy/angular` failed; the shared style
leaves embedded code as it is, decided in Health's module and copied (formancy.ai-health 0017).
And it is larger: with this repository's paths, as first committed, the shared rules reported
719 findings in 223 files, none fatal, measured on 30 October 2026.

## Decision

- **One package, `@formancy/code-style`.** `packages/code-style/src` holds the module and its
  test, Formancy Health's `scripts/code-style/` at `4f151a2` byte for byte, with a manifest, a
  README, `LICENSE` and `NOTICE` around them. It is published as it is written, JavaScript with
  no build and no types, at the one version every package here carries
  ([0009](0009-independent-spec-version.md)). The rules, the seven relaxations in a test,
  `require-await` off in every file, the style, TypeScript and JavaScript alone, and why each is
  so, are formancy.ai-health 0017's, and are not restated here.
- **This repository lints itself with it**, from the workspace: `eslint.config.mjs` calls
  `eslintConfig` with this repository's paths, and `prettier.config.mjs` re-exports
  `prettierConfig`. `apps/docs/src/lint.test.ts` holds what each path is:
  - `project`: `./packages/*/tsconfig.json` and `./apps/*/tsconfig.json` by glob, so that a new
    package or app is linted with types without an edit, and `tsconfig.tools.json`, which brings
    the vitest, Vite and tsdown configs into `pnpm typecheck`, and the site's
    `decision-records.ts`, which the site's Vite config imports and no tsconfig named. The Angular
    packages' `tsconfig.spec.json` is not named: their tests are in `tsconfig.json`'s programs,
    which `pnpm typecheck` runs.
  - `ignoreFiles`: the root's `.gitignore` and `apps/docs/.gitignore`. Prettier resolves every
    file it is handed with `--ignore-path` against the working directory, so the nested file's
    patterns would reach the whole repository; they are written into `.prettierignore` with
    their directory in front, and the guard derives them.
  - `untyped`: the two install fixtures, which import the packed tarballs; `browser`: the scripts
    that drive Playwright; `react`: the five workspaces whose manifests declare React.
  - The generated validator, `packages/spec/src/generated/document-validator.js`, is neither
    linted nor formatted: formatting would spread its one line over ten thousand.
- **Not in the rules:** a layer boundary, which stays the compiler's and the manifests' (0008);
  and a log line in a published package, which stays `console.test.ts`'s (0115). ESLint makes
  each possible, and each would be a record of its own.
- **Every finding fixed.** A disable comment is for a finding that is deliberate, and says why
  after `--`; five were added, and the eleven `react-hooks/exhaustive-deps` disables already here
  were given their reasons. Five findings were defects, each fixed in a commit of its own with a
  test that failed first, and each in the CHANGELOG: the React builder named a translated
  choice's Remove button "Remove [object Object]"; a code node drew a scannable code of an
  object; an expression returning a record with numeric `seconds` and `nanos` returned
  "[object Object]"; a submission read back, and a rule's explanation, said an answer of an
  unexpected shape as "[object Object]", now said by one function, `answerAsStored`, which
  `@formancy/core/words` exports; and the admin's fill pane posted the outcome of pressing
  Submit instead of the answers. And two tests did not test the patterns they named, whose
  backslashes a string literal had dropped.
- **The gate:** `verify` runs `pnpm lint` and `pnpm format:check` after the build and the
  typecheck, since the type-aware rules read the declarations the build wrote, and before the
  tests, so a finding fails the job in a minute. The release runs both after its typecheck as
  well: nothing requires a tag's commit to have passed CI (arc42 §11.6), and a release that
  publishes the rules should not be the first to break them. In `verify` rather than a job of
  its own, which would build again what `verify` has built.
- **One format commit, merged as it is.** The format is one commit of Prettier's output and
  nothing else, the commit `.git-blame-ignore-revs` names; the size budget's caps were lowered
  to the formatted lengths in the commit after it, and one entry left the list. **The pull
  request that brings this merges with "Create a merge commit", never a squash or a rebase**: a
  squash folds the format into one commit with everything else, a rebase gives it another SHA,
  and either way the file names nothing on `main`.
- **Until the others pin it.** Formancy Health and Formancy Data carry the module as
  `scripts/code-style/`, Health's the original and Data's its copy, and a rule this repository
  needs is changed in Health's module first and copied here byte for byte, never here alone.
  Once this package is released, each swaps its copy for it in a pull request of its own,
  pinned exactly as a root devDependency (formancy.ai-health 0017, formancy.ai-data 0114); from
  then a rule is changed here, and reaches each of them by a release and a bump of its pin.
- **The licence, the maintainer's to confirm.** The rules were written in Formancy Health, under
  its source-available terms, and are published here under Apache-2.0, as everything here is
  ([0002](0002-apache-2-0.md)). Both repositories are the maintainer's, and the module is
  configuration with no product code in it. Nothing is published until he cuts a release, and
  he is to confirm the terms before the first one that carries the package.

## Consequences

**What it buys.** A promise nobody awaits, an `any` from a parse in a package's source, an
assertion of a type already known, a name nobody uses, a global mistyped in a script and an
object printed as "[object Object]" fail the pull request that brings them. Five defects were
found by the rules the day they first ran here. The style is a check and not a habit, and once
the others pin this package it is one version of one module in all four.

**What it costs.**

- **Blame.** The format commit rewrote 628 files, adding 4,862 lines and removing 11,972, measured
  with `git show --shortstat`. GitHub's blame skips it by `.git-blame-ignore-revs`; `git blame`
  skips it only with `--ignore-revs-file` or `blame.ignoreRevsFile` set; and `git log -S` and
  `-L` see it, as does any tool that reads neither.
- **Every branch open under the format conflicts with it.** None was open when this branch
  began, after 0.11.0's release on 30 October 2026, nor when GitHub was read at 16:40 UTC that
  day; one pull request, #322, which changed `RELEASING.md` alone, opened and merged in between
  and came into this branch without a conflict. A branch begun before the format takes the new
  `main`, resolves each conflict for its own change, and runs `pnpm format`. Formancy Data has a
  merge driver that formats both sides before git merges them (formancy.ai-data 0114); nothing
  here offers one.
- **The release couples the four.** Health and Data are to pin a released version, so a rule
  changed here reaches them only when formancy.ai releases and each bumps its pin, and the bump
  may bring findings or a reformat with it. Every package here is released at one version
  (0009), so each release publishes a new `@formancy/code-style` whether its rules changed or
  not, and a repository pinning it either bumps for nothing or falls behind on a version number
  that says nothing about the rules. Until each pins, the module is three copies, here, in
  Health and in Data, which nothing compares.
- **The licence is a question until it is answered.** Should the maintainer decide the rules
  belong under Health's terms, the package's licence changes before its first publish, and this
  repository, which lints itself with it, would depend on terms it uses nowhere else.
- **The release's SBOM names lint tooling.** It is made from every package the release publishes,
  installed as a consumer installs them (0187), so this package's dependencies — the rule sets,
  typescript-eslint's parser and plugin, the hooks plugin and the Babel it parses with — are in
  it as required, though nothing a form, a builder or the server runs imports them
  (`RELEASING.md`, `SOUP-DECLARATION.md`).
- **ESLint's Node is not the repository's.** ESLint 10.13.0 and `@eslint/js` 10.0.1 declare
  Node `^20.19.0 || ^22.13.0 || >=24`, and the repository's engines admit 22.12, which CI's
  `node` job runs. That job runs no lint; a contributor on Node 22.12 lints outside the Node
  ESLint says it runs on, and a consumer of the package meets ESLint's floor, not the
  repository's.
- **Typed lint's time**, inside `verify`'s 20 minutes: 26.4 s on the Mac above; not measured on
  CI's runner.
- **What formancy.ai-health 0017 lists, all of it true here too:** Prettier loads the lint rules
  with the style; a pointless `async` is no longer reported, with `require-await` off; a test
  may read a member an `any` does not have and pass; typescript-eslint 8.72.1 admits TypeScript
  below 6.1.0, a second ceiling beside Angular's ([0039](0039-pin-typescript.md)); a Prettier
  release is a reformat, one more commit for blame to skip; and a disable comment's reason is
  review's to read.
- **The merge method is remembered, not held.** The repository allows a squash, a rebase and a
  merge commit, read from GitHub's API on 30 October 2026, and nothing refuses the first two.

**What it forecloses.** A rule at `warn`; a style decided file by file; a rule changed in one
repository alone; and, for the pull request that brings this, a squash or a rebase.

## Alternatives considered

**A copy per repository.** What Health and Data carry until they pin, and what each would carry
for good: no release to wait for and no version to bump, and a rule changed in one copy reaching
the others only when somebody copies it again, which nothing compares or notices. Rejected as the
end state: "the same quality" in four repositories is one set of rules, and a package each pins
at an exact version is how these repositories already share everything else formancy.ai
publishes.

**A repository of its own for the rules.** Rejected: one more repository with a release workflow,
provenance, signing and an SBOM, for one module, where formancy.ai already releases every package
the other three depend on with all four.

**The rules published under Health's source-available terms.** Rejected for now: every package
here is Apache-2.0 (0002), and this repository lints itself with this one. The cost is the
question above, which is the maintainer's to settle before the first publish.

**Biome, no linter, linting per package through turbo, warnings, 120 columns, every kind of file
formatted, `allowDefaultProject` for the tool configs, and a hook before each commit.** Each
rejected in formancy.ai-health 0017, for reasons that hold here.

**A boundary rule for 0008's layers, or `no-console` for 0115.** Not added: the compiler and the
manifests hold the layers, and `console.test.ts` reads every shipped file whether or not ESLint
does. Either would move a decision a record holds into a rule file, where an exception can be
added in the same commit as the violation, 0008's own argument.

**A test comparing the package's module with Health's.** Rejected: it would read another
repository, which needs the network, and a check that answers differently in CI than locally is
not a gate. `cmp` by hand, dated above, is what holds it until the others pin.

## Older records

[0008](0008-layered-packages.md), [0037](0037-turborepo-over-nx.md) and
[0115](0115-a-library-writes-nothing-to-its-hosts-console.md) are not superseded: each decision
stands. Each said, as a fact of its day, that the repository ran no linter, and each now says
beside it, in its Status line and where the sentence is, that this record changed that fact and
what it did not change: no boundary rule enforces 0008's layers, the
`eslint-plugin-boundaries` 0037 expected is not added, and `no-console` is not what holds 0115.
