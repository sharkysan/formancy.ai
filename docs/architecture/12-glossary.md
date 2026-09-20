# 12. Glossary

Terms that mean something specific here, and that a reader will otherwise
reasonably misread.

| Term | Meaning in formancy |
|---|---|
| **Answer** | A value a person entered, as opposed to one the engine computed |
| **Capability** | The injected `now`, `today` and `random`, frozen per evaluation pass. The engine never reads them ambiently ([0019](../decisions/0019-injected-capabilities.md)) |
| **CEL** | Common Expression Language. Non-Turing-complete, typed, with a compile-time checker ([0016](../decisions/0016-cel.md)) |
| **Data path** | How a value is addressed: `email`, `address.city`, `contacts[2].email`. Pages contribute nothing ([0012](../decisions/0012-pages-scope-nothing.md)) |
| **Driver** | An adapter implementing `RendererDriver`, letting one fixture run against one implementation ([0033](../decisions/0033-one-suite-n-drivers.md)) |
| **Field key** | Immutable identity, separate from the label. Changing it requires a declared rename ([0011](../decisions/0011-declared-renames.md)) |
| **Fixture** | A JSON case — a schema plus steps — that is the single source of truth for one behaviour |
| **Form version** | An immutable published snapshot of a schema. Submissions bind to one, forever ([0025](../decisions/0025-immutability-in-the-database.md)) |
| **Isomorphic** | Runs unchanged in a browser and in Node, from one build ([0006](../decisions/0006-one-engine-build.md)) |
| **Layout** | A named arrangement of an existing model, placing fields by data path. Optional ([0014](../decisions/0014-presentation-sections.md)) |
| **Message reference** | `{ "$t": "some.id" }` in place of literal text, resolved against the `i18n` catalogues |
| **Model** | The part of a document that says what is collected and under what names. Distinct from words and arrangement |
| **Orphaned data** | Answers whose field no longer exists, moved to `data.__orphaned` on draft migration and **never deleted** ([0027](../decisions/0027-lazy-draft-migration.md)) |
| **Prop getters** | Serialisable objects carrying every id and ARIA attribute, computed centrally ([0021](../decisions/0021-engine-owns-aria.md)) |
| **Repeater** | A field that holds rows of a template. Contributes an indexed path segment; rows carry a stable generated id so renderers never key by index |
| **Replay** | Rebuilding the engine from the exact version the client used and re-evaluating everything server-side ([0030](../decisions/0030-never-trust-client-state.md)) |
| **Schema hash** | sha256 over the canonical serialisation. Tamper evidence and cache key ([0010](../decisions/0010-canonical-hash.md)) |
| **Severity** (of a diff) | `compatible`, `lossy` or `breaking`, as `diffSchemas` reports. Drives draft migration. **Not** a risk severity — see below |
| **Snapshot** | A field's frozen observable state, whose identity changes only when that state changes ([0020](../decisions/0020-identity-stable-snapshots.md)) |
| **SOUP** | Software Of Unknown Provenance, IEC 62304's term for third-party software in a medical device. See [`../regulatory/SOUP-DECLARATION.md`](../regulatory/SOUP-DECLARATION.md) |
| **Spec version** | The version of the document format, carried inside each document. Independent of package versions ([0009](../decisions/0009-independent-spec-version.md)) |
| **Submission** | A completed, server-validated set of answers. Never migrates |
| **THE RULE** | That a conformance driver may resolve elements only by role and accessible name ([0034](../decisions/0034-accessible-name-only.md)) |
| **Touched** | Whether a person has interacted with a field. Decides when a message is shown, not whether it exists |
| **Wire path** | A data path in its string form, as used for map keys and DOM ids |

## Two collisions worth flagging

**"Severity"** means the diff classification, not clinical or risk severity.
[`../regulatory/SAFETY-ANALYSIS.md`](../regulatory/SAFETY-ANALYSIS.md)
deliberately assigns no risk severity at all, so the word is unambiguous within
this repository — but it will not be unambiguous in a manufacturer's document
set.

**"Validation"** is used for three different things and the documents are
careful to say which: structural validation of a *document* against the JSON
Schema, semantic validation of a *document* against the spec's rules, and
validation of *answers* against a form's rules. See
[§8.4](08-crosscutting-concepts.md).
