# 0115 — A library writes nothing to its host's console

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/docs/src/console.test.ts` — no shipped source file in a published
  package that ships script refers to `console` at all, outside comments; the scan has to
  read source from every one of them; and the one package allowed to write names itself
  and exists. Failed first on the two lines below. Proved against a bracketed spelling
  (`console['log']`), a call on the same line as a URL string, and the comment-stripping
  removed — which makes a sentence about the console in `@formancy/tiptap`'s docblock
  count.

## Context

`@formancy/builder-angular` logged two lines on every ↓ keypress in its structure tree —
`PROBE before …` and `PROBE after …`, a debugging probe left in the key handler — from
the release that introduced the package. An application embedding the builder had its
console filled with somebody else's diagnostics, and nothing in the repository could
notice: the tests assert on the DOM, and the browser gate collects page errors, not log
lines.

A library's console belongs to its host. Whatever it prints, the host's developers read
as their own application talking, and a host that forwards its console to telemetry
ships it somewhere neither party chose.

## Decision

**A published package that somebody imports refers to `console` nowhere** — not a
warning for a deprecated option, not a `console.debug` behind a flag. A library that has
something to tell its host says it through its API: a refusal with a message, an outcome
the caller reads.

`@formancy/mcp` is held to it as well, for a sharper reason: over stdio its standard
output *is* the protocol, and one stray line corrupts the stream.

`@formancy/server` is the exception, named in the test with its reason: it is an
application with its own process, and its standard error is its own.

Which packages ship script is read off their manifests rather than listed, so
`@formancy/themes`, which exports five stylesheets, is out of scope by what it is, and a
package that starts exporting a module is scanned without anybody adding it.

## Consequences

**A deprecation cannot be announced at run time.** A library that renames an option
cannot warn the host that it is using the old one; the CHANGELOG and `MIGRATIONS.md` are
the only channels, and a host that does not read them finds out when the old name stops
working. That is a real cost, and the alternative is a library that decides on its host's
behalf what the host's console is for.

**The rule is absolute rather than a level**, so it is easy to state and easy to check —
and it means a contributor debugging a renderer has to remove their probe before the
pull request is green, which is the point.

**It says nothing about the server's own output**, which is a separate question with a
separate answer: hazard C3 in `SAFETY-ANALYSIS.md`, corrected alongside this record
because it claimed the server wrote nothing at all.

## Alternatives considered

**A lint rule (`no-console`).** The right shape in principle, and `pnpm lint` exists — but
no CI gate runs it, and a rule that does not gate is a comment. The test runs where every
other gate runs.

**Allow `console.warn` and `console.error`, forbid `log` and `debug`.** That is a
judgement about which of the host's channels a library may use, and it is the host's
judgement to make. A warning in somebody else's console is noise they cannot turn off.
