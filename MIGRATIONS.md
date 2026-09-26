# Versioning and migration policy

## Two version lines, on purpose

**Package versions** (`@formancy/*`) move together as one number. Before 1.0,
breaking changes may land in minor releases; every one is documented here with
what changed, why, and how to move.

**The spec version** (`specVersion` inside every form document) is independent
of package versions, because it is the artifact with real switching costs:
your forms and your submissions are written against it. Packages 0.9 and 1.4
can both speak spec `"1"`.

## Spec version 1 is FROZEN

Spec `"1"` is frozen as of 2026-09-20. A document that validates today will
validate against every future release that speaks spec 1.

It shipped as `"0"` and unstable first, on purpose. Three things about the
model turned out to be undiscoverable without a renderer and a server actually
using it, and each of them is a decision that cannot be taken back once there
is data:

| Question | How it was answered |
|---|---|
| What happens to a hidden field's answer? | `clearOnHide`, defaulting to true, and the server applies the same reading so a client cannot smuggle data into a hidden branch |
| How does a repeating-group row keep an identity that is not its position? | Each row carries `_id`, minted by the engine, in the data — so a submission read years later can still say which row an answer belonged to. `_id` is reserved and no field may use it |
| Where does a validation check run? | `runsOn: 'both' \| 'client' \| 'server'` on a validate rule. Metadata rules may not set it, because a visibility rule that differed between the two sides would stop the server being able to check the client |

Nothing was ever published under spec `"0"`, so there are no version-0
documents in the world and no migration from 0 to 1 exists. If you have a
document from a pre-freeze checkout, change its `specVersion` to `"1"`, give
every repeater row an `_id`, and validate it.

From spec `"1"` on:

- a spec version bump is always a MAJOR event, announced ahead of time,
- `@formancy/cli migrate` rewrites documents from version N to N+1 — schemas
  are data, so the migrator is cheap to provide and it is the single strongest
  trust signal we can offer,
- submissions never migrate: they stay bound to the exact form version that
  produced them, forever. That binding is what makes an old submission
  auditable, and no upgrade may touch it.

## If you ran `docker compose up` before 2026-09-20

An earlier compose file supplied default values for the auth secret and the
first admin's password. Both were in the repository, so both were public.

Fixing the compose file does not fix an installation that already booted with
them: the admin row is in the volume and still works. Verified rather than
assumed — the old password authenticated against a running container after the
defaults were removed.

If you have such an installation, change that account's password, and rotate
`FORMANCY_AUTH_SECRET`, which invalidates every session signed with the old
one. Or, if it holds nothing you need, `docker compose down -v` and start
again.

## Known pre-1.0 caveats

- The spec is frozen; the PACKAGES are not. Their APIs will still change before
  1.0, and those changes are documented here.
- Async validators do not exist. When they arrive they will need a new rule
  kind, which is a spec 2 change — the version line exists for exactly that,
  and `runsOn` is already in place so the ordering question can be answered
  without restructuring anything.

## Drafts need a token (unreleased)

**Why you cannot skip this.** The previous draft routes let anybody read or
overwrite anybody's part-filled form: both were unauthenticated and the id came
from the caller. If you autosave drafts on a public form, treat any draft written
before this change as having been readable
([0062](docs/decisions/0062-a-draft-carries-its-own-key.md)).

**What changes.** Start a draft instead of inventing an id:

```
POST /f/:path/drafts   ->  201 { draftId, token }
```

Then send the token on both of the routes you already use:

```
PUT /f/:path/drafts/:draftId    X-Formancy-Draft-Token: <token>
GET /f/:path/drafts/:draftId    X-Formancy-Draft-Token: <token>
```

Without the header both answer **401**. With a token that does not match, the
`GET` answers **404** — the same as a draft that is not there, on purpose, so the
reply cannot be used to find out which ids exist — and the `PUT` answers **403**.

**Keep the token wherever you kept the id**, and keep it instead of the id rather
than as well: the id is no longer a secret and the token is the only way back into
the draft. Losing it loses the draft, and there is no recovery path, because a
recovery path that works for whoever asks is the hole again.

**Drafts written before the change cannot be resumed**, since no token was ever
minted for them. They are swept on the usual schedule.
