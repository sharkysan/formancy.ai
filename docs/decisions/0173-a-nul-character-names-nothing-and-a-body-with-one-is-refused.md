# 0173 — A NUL character names nothing, and a body with one is refused

- **Status:** accepted
- **Date:** 2026-10-11
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server/src/nul-character.integration.test.ts`, on real PostgreSQL:
  the public read of a form with a NUL in its path answers `404 unknown_form`; every parameter of
  every route in the route table, read as Fastify registers it, answers a NUL exactly as it
  answers a name nothing has — fifteen routes' `:path` answered `500` before; a NUL put into each
  string and each member's name of a well-formed body for every route that takes one, and into a
  member of its own, answers `400 nul_character` with the JSON Pointer to it — every route
  answered something else before, `500` for an answer, a draft, an example, a form's path, a
  file's name or type, an origin, an email and a key's name; a guard on the guard fails for a
  route that takes a body and has none there; a sign-in answers the same body for an address
  with an account and one without; a draft sent as `text/plain` is refused at the empty pointer;
  a file's bytes with NUL bytes in them, and a submission with every other control character
  and with the escape spelled out as six characters, are kept as sent; an API key header with a
  NUL is a request with no identity; an anonymous request with a NUL in its address is still
  asked for a session first; and no case writes a line at `error`. `nul-characters.test.ts`: the
  pointer escapes `~` and `/`, names the first NUL in the order the body was written, and a body
  nested a hundred thousand deep is an answer rather than a `500`. `postgres-storage.test.ts`: a
  form's path, an email, an API key's prefix and a draft's id with a NUL are answered without
  asking a database nobody is listening for, and the same values without one are asked. Each
  was watched failing: the address cases with the storage's check on a path taken out, the API
  key's with its own, and each storage lookup with its own; the body cases with the hook not
  registered; the bytes case with a `Buffer` read for a zero byte; the stored-as-sent case with
  the hook refusing every control character, and again refusing the escape spelled out; the
  pointer's cases with names unescaped and with an object's members walked last first; the depth
  case with the walk recursive; the guard on the guard with a route's body taken out of the
  list, and the sweep's with its pattern matching only `:path`; and the session-first case, the public read and the address sweep with a hook that
  answered a NUL in the URL with a `404` of its own before the route.

## Context

PostgreSQL holds no NUL character, U+0000. In `text` it refuses one with `22021`, and in `jsonb`
with `22P05`, an escape it does not support. [0172](0172-a-5xx-says-nothing-of-what-was-thrown.md)
found the first on two inputs — a form's path on the public read, which no limit counts, and a
sign-in's email — and left them: each a `500` and two lines at `error`, a `request.failed` and
the request's own, so anybody could write lines at `error` at will. The in-memory storage every
other suite runs on holds a NUL like any other character, so the two storages disagreed and only
real SQL could see it, as with the uuid 0172 decided about.

A survey on 2026-10-11 tried a NUL in everything a request sends that reaches PostgreSQL, against
real PostgreSQL. Over a socket Node refuses a raw NUL in the request line or in a header with a
`400` before Fastify sees the request, so what reaches a route is a NUL decoded from `%00` in the
address, one escaped as `\u0000` in a JSON string or a member's name, or one in a `text/plain`
body. A `500`, `22021`: a form's path in every one of the fifteen routes that take one; a
sign-in's email; a new user's email; an API key's name; a form's path in a publish; a file's name
and its type on an offer; an origin in a form's access settings; and an API key's prefix, through
a header that only an injected request can carry. A `500`, `22P05`: a submission's answer, and a
member's name the form does not have, which the submission keeps; a draft's answers, a member's
name or a whole `text/plain` body; a published form's schema; and a form's kept examples
([0166](0166-a-deployment-keeps-a-forms-examples-and-runs-them-at-publish.md)) and the sample
they start from. Not a `500`: a draft's id, refused for its key before it is looked up; a file's
and a delivery's id, which 0172's uuid check answers; a password, which is hashed and never
stored; a model's text, which goes to the provider and not to the database; a hidden field's
answer, dropped before the submission is stored; the access setting's `submit`, one of two
words; and a file field's name, refused as unknown. No route writes a webhook's address — only
the storage does — and the two query parameters, `limit`, are read as numbers.

## Decision

**A value with a NUL in it names nothing.** The PostgreSQL storage answers no row for a lookup by
a form's path, an email, an API key's prefix or a draft's id with a NUL in it, without asking
(`fitsText` in `server/db.ts`, beside 0172's `isUuid`): what the port says and what the in-memory
storage does. So each route answers a NUL in its address with its own answer for something that
is not there — `404 unknown_form` for a path — in its own order, a session asked for first where
one is needed.

**A body with a NUL in any string or any member's name is refused as malformed**, before any
route's own code, by one `preValidation` hook on the root instance (`server/nul-characters.ts`):

```json
{ "error": "nul_character", "pointer": "/email", "message": "The NUL character (U+0000) is in no string this server accepts, and this request's body has one at /email." }
```

`pointer` is the [RFC 6901](https://www.rfc-editor.org/rfc/rfc6901) JSON Pointer to the string, or
to the member whose name holds it, and is empty for a body that is itself a string. A file's
bytes arrive as a `Buffer` and are not looked at.

**A sign-in is refused like any other body.** A NUL in its email or its password is `400`, as a
body of the wrong shape has always been, where a wrong password is `401`. That keeps what
[0031](0031-enumeration-resistant-login.md) is for: the refusal is decided by the body before any
account is read, and is the same answer, byte for byte, for an address with an account and one
without, so it says nothing about which addresses have one.

## Consequences

**A NUL in a request's address or body is no `500` on any route, and no line at `error`.** A
refusal is a `400` or a `404`, written at `info` as every other 4xx is (0168). Every route that exists, and every one added later,
has the refusal without a line of its own, and a route with an address or a body is swept by the
test from the route table, or fails its guard until it is given a body.

**Nothing without a NUL is touched.** Every value that was stored before is stored the same way,
and no value with a NUL was ever stored, because every write of one failed. Only U+0000 is
refused: every other control character is accepted as it was, and so are the six characters
`\u0000` typed out.

**Some requests that were answered are refused.** A sign-in whose password has a NUL in it was a
`401` and is a `400`. A user created through `POST /users` with such a password — which that route
accepted, `201`, measured — can no longer sign in, and nothing says which users those are: the
password is a hash. No route deletes a user or changes a password, so their address stays taken.
A model request whose text has a NUL was sent to the provider and is refused. A submission whose
NUL was in an answer the form would have dropped — a hidden field's — was stored without it and is
refused whole.

**A management route says a body is malformed before it asks for a session**, as it does for a body
that does not parse. Somebody without one learns that their body had a NUL in it, which they sent.

**A sign-in refused for a NUL writes no audit row.** One with a NUL in its email wrote none before
either — it was a `500` before the row — and was an attempt at no account, since none can have such
an address. One with a NUL in its password was recorded as a failed sign-in and is not now; it is
refused before any password is checked, so it guesses nothing. The request log has its `400` on its
route.

**Every request with a body pays a walk over it**, a stack of its own rather than a recursion, that
builds nothing for a value unless the value has a NUL. Measured on 2026-10-11, on one machine and
Node 22: a body at the 256 kB cap holding 14,780 strings took a median 1.2 ms longer, against 3.3 ms
for the request without it; a body of three answers, nothing measurable. A first version that
built a pointer for every value took 4.6 ms on the same body, longer than the parse.

**The storage still refuses a NUL in a write.** A host calling `server-core`'s use-cases with the
PostgreSQL storage, past `createApp`, meets `22021` or `22P05` as a thrown error, where the
in-memory storage keeps the value; the HTTP edge is what keeps a NUL away from it. The reply
echoes a member's name with its NUL, escaped as JSON escapes it.

## Alternatives considered

**Strip the NUL, or replace it with U+FFFD, and store the rest.** No refusal at all, and every
answer stored. But the stored answer is not what was sent: a response, a schema or an example
would say something its author did not send, and nothing would say it had changed.

**Store it escaped**, or move the answers to `json`, which takes `\u0000` where `jsonb` does not.
An escape makes an answer read back differently from what was sent, and indistinguishable from the
six characters typed; `json` changes every column's type and query for one character, and `text`
still refuses it.

**Refuse it in the storage**, a `400` thrown from the adapter's write. It is the place that knows
the column, but it refuses late — a challenge already spent, the form's rules already run — its
pointer is into the stored value rather than the body, and a failed sign-in's audit row with the
address in it would still fail, at `error`.

**Refuse a NUL in the address at the edge too**, with a `404` of the hook's own. One place for
everything, but the answer is a body no route has, and it comes before a session is asked for. The
sketch failed the session-first case, the public read's `unknown_form` and the sweep that compares
a NUL with an unknown name.

**Answer a sign-in with a NUL like a wrong password.** It is what an unknown address answers, but
the attempt's audit row has a subject the column cannot hold — altered, or not written — and the
one hook would need an exception for one route, to buy nothing 0031 asks for.

**Look for `\u0000` in the raw body before it is parsed.** Cheaper than a walk, but a JSON string
holding a backslash before `u0000` spells the same six characters without a NUL in it, and a
`text/plain` body carries the character itself; it would refuse the one and need a second rule
for the other.

**A schema on every route.** No route here declares a body schema, and an answer's members are
named by the form, so no schema could list them.
