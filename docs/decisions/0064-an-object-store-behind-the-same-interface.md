# 0064 — An object store behind the same interface, and our own signer

- **Status:** accepted
- **Date:** 2026-09-26
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server/src/s3-file-store.integration.test.ts`
  (6 cases against a real Garage in a container: a byte-exact round trip, the
  stored size, absence answered as absence, remove-then-remove-again, keys
  containing a space and a plus kept distinct, and **a wrong secret refused** —
  that last one is what stops the other five being vacuous). Plus
  `packages/server/src/sigv4.test.ts` (5 mechanical cases) and
  `packages/server/src/s3-file-store.test.ts` (9 cases on the request shape and
  the status-code mapping). `packages/server/src/compose.test.ts` fails if the new
  settings are documented and not passed through.

## Context

`FileStore` has had one implementation since it was written: a directory on local
disk. The interface exists because the second one was the point — and the second
one was listed as "designed, not built" in four documents, which meant the ceiling
below was a property of the product rather than a note about it.

**The ceiling is one replica.** Two containers with two volumes each accept
uploads the other cannot serve, so a file uploaded to one is missing from the
other, intermittently, depending on which container answered. That is not a
degradation a self-hoster can work around; it makes horizontal scaling
unavailable, which for a form product is the ordinary case rather than an
exotic one.

## Decision

**S3 behind the existing `FileStore`, with SigV4 written here rather than
imported.**

Four methods, four HTTP requests: `put` is a PUT, `open` is a GET streamed back,
`remove` is a DELETE, `sizeOf` is a HEAD. Path-style addressing, so no DNS entry
per bucket. Nothing above the interface changes, and nothing below it knows which
store it has.

**Not tied to Amazon.** Garage is what the design calls for and what the tests
run against; the same code path serves MinIO, Backblaze B2, Cloudflare R2 and real
S3, because all they need in common is SigV4 and path-style URLs.

**Every setting is required once the endpoint is set, and none is defaulted.** A
guessed bucket name is a deployment that uploads into nothing. Guessed credentials
are a deployment where every file reads as missing. Both fail at startup instead,
which is the only point at which they are cheap.

**Configuring both stores is refused at startup.** Two stores means half the files
land in one and are looked for in the other, and nothing records which — so a
later reader gets "no such file" for bytes that plainly exist.

### Why the signer is ours

`@aws-sdk/client-s3` brings dozens of transitive packages to do PUT, GET, DELETE
and HEAD against one bucket, and each is a row somebody has to characterise in
`SOUP-DECLARATION.md`. A manufacturer incorporating this reads that table.

`aws4fetch` is one MIT file with no dependencies and would have been a reasonable
answer. It was last published in 2024 by a single maintainer — the same bus-factor
shape as `@marcbachmann/cel-js`, which is handled by owning a facade around it.
Here the whole surface is smaller than that facade would be.

So it is sixty lines against a frozen specification, with **no new runtime
dependency at all**, and the algorithm's own vocabulary in the names so it reads
beside AWS's description of it.

### What verifies it, and why that mattered more than usual

Hand-rolled signing is only defensible with an oracle. Unit tests around a signer
can show it is self-consistent; they cannot tell whether the canonical request is
*right*, and they pass just as happily on one every real S3 refuses.

**So Garage is the oracle**, in a container, on every run. The verifying half of
SigV4 is somebody else's code, and a signature wrong in any of the six steps is a
403 with nothing stored. The suite therefore carries a case asserting that a wrong
secret *is* refused — without it, a store that ignored signatures would make the
rest of the file prove nothing.

The obvious alternative was AWS's published `get-vanilla` test vector. Its
expected `Authorization` header is not reachable from this machine without a
GitHub token, and writing the constant from memory would be a guess wearing a
vector's clothing — passing if the memory were wrong in the same direction as the
code, which is the one failure a vector exists to catch. Recorded here because
"we could not get the vector" is a better reason than it looks: the substitute is
stronger evidence, not weaker.

## Consequences

**Bytes still pass through the server.** A presigned PUT straight from the browser
is the eventual shape, and it is the only way to accept a file larger than the
request body cap. That changes the upload flow end to end, both renderers
included, and is a separate piece of work. This decision moves where the bytes
land without touching how they arrive — the smaller half, and the one a second
replica needs. It is now the file story's remaining debt rather than a footnote to
the local store's.

**Two things were found by writing the tests rather than by reading the code:**

- **403 must not mean "no such object".** The first version treated it as absence,
  on the reasoning that S3 answers 403 rather than 404 for an object a caller may
  not list — true, and about a *restricted* caller. This caller owns the bucket,
  so a 403 means the credentials are wrong, and reading that as absence makes a
  misconfigured deployment indistinguishable from an empty one. The collector
  would then delete every row while every object was still there. 404 only.
- **`content-length` can be neither set nor signed.** undici refuses a manually
  supplied one and computes its own. Nothing is lost: AWS requires only `host` and
  the `x-amz-*` headers in the signature, and `x-amz-content-sha256` is a hash of
  the exact bytes, which constrains the length far more tightly than a signed
  length would.

**Neither compose file runs a store.** They pass the settings through and point at
nothing. A fresh Garage node accepts no data until a layout is assigned, and that
is four `garage` commands after the container starts rather than anything a
compose file can declare — so shipping a Garage service would produce a stack that
looks configured and silently stores nothing, which is worse than not shipping
one. Recorded as debt with the reason, so the next attempt starts from why it is
awkward.

**`testcontainers` is a new development dependency**, alongside the PostgreSQL
helper that already depended on it. No runtime dependency was added.

## Alternatives considered

**Presigned uploads now, skipping the server-side store.** The design's eventual
shape and rejected as the wrong order: it needs a new upload flow in both
renderers, a claim-after-HEAD step, and a client-side retry story, and it does not
remove the one-replica ceiling any sooner than this does. Doing the smaller half
first means the ceiling is gone while the larger half is designed.

**`@aws-sdk/client-s3`.** Rejected on the SOUP cost for four operations, above.
It would also bring multipart and presigning for free, which is a real argument
for revisiting it if and when the presigned flow lands — at that point the
dependency buys something.

**A `StorageAdapter` abstraction above `FileStore`, as the design sketched.**
Rejected as a layer with nothing in it: `FileStore` already is that abstraction,
and adding a second one to hold two implementations is the kind of indirection that
reads as design and costs comprehension.

**Multipart upload for large files.** Not needed while the request body cap is
lower than any store's single-PUT limit — 5 GB for S3. It becomes necessary
together with presigned uploads and not before, so it is one piece of work with
them rather than half of one now.
