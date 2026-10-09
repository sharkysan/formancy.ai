# 0135 — A block is a field with its rules and its words, and the host keeps it

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/builder-core/src/blocks.test.ts` — saving keeps the rules that
  read only inside the field and counts the one that reads outside; a page and a field in a
  repeater row are refused; inserting renames a clashing key, re-roots and renames every rule
  and the condition metadata beside it, inside a group as well as at the top; a word the form
  says differently is renamed and one it says the same is shared; a block with rules is
  refused inside a row; the places offered include ones the form has no words for yet, and
  every one of them lands valid; one insert is one undo. Removing the renaming of words, the
  words from the place probe, or the trial insert per container fails a named case.
  `packages/builder-react/src/blocks.test.tsx` and `packages/builder-angular/src/blocks.test.ts`
  — the palette offers blocks beside the field types, the place dialog lists where one goes,
  `b` saves the focused field and hands it to the host, and without a host that keeps blocks
  `b` is not a command and the key help does not name it. `apps/playground/src/blocks.test.tsx`
  — the demo block lands in the starter with its rule following its renamed keys, and a block
  saved in either builder is offered by the other.

## Context

The backlog asked for reusable blocks: an address, a contact person, a set of consent
questions, saved once and put into the next form. Copying the JSON of a group does not do it,
for three reasons a form here has and a plain document does not:

- **Keys are unique across the whole form.** An address saved from a form that already has a
  `country` cannot keep its own `country` when it goes back into that form.
- **Rules name fields by path.** The rule that shows a canton for Switzerland reads
  `address.country`; once the group is called something else, or its `country` is, the rule
  reads nothing — and a rule that fails to evaluate shows the field it was meant to hide.
- **Words are referenced by id.** A label is `{ "$t": "address.title" }`, and the words live
  in the form's catalogue, not in the field.

## Decision

**A block is a field — usually a group or a repeater — with the rules that live entirely
inside it and the words it names.** `blockFrom` saves one; `withBlock` puts one into a form;
both are pure, in `@formancy/builder-core`, and both builders call the same two.

**A rule comes along only if it reads nothing outside the field.** A rule reading a field
outside would arrive reading nothing, or whatever the new form happens to call by that name.
Those are left behind and counted, and the builder says how many, so nobody finds out by
inserting the block.

**Inserting is a rename and a move at once.** A key the form already uses becomes `city2`; a
word id the form already says differently becomes `title2`, and the same words under the same
id are shared rather than copied. Every rule the block carries is re-rooted from where it was
saved to where it lands and renamed with its keys, through the same `repathRules` a rename in
the builder uses, condition metadata included. It is one edit, validated like any other, so
undo takes it back.

**The places offered are exactly the places it lands.** `blockTargets` asks a session over
the form with the block's words already in it, and then tries the real insert once per
container. A block with rules is refused inside a repeater row, where its rules would be about
every row; that place is then not offered, rather than offered and refused.

**The host keeps blocks.** A builder takes a list (`blocks`) and hands back each one saved
(`onSaveBlock` in React, `blockSaved` in Angular). Where they are stored, who may use them and
how they are shared is the deployment's, as a form's scenarios are. Binding the list is how a
host says it keeps blocks: only then is `b` a command, because a key that saves something
nobody keeps loses it.

## Consequences

**A block is a copy, not a link.** Changing a block changes no form that used it. That is
what keeps a form self-contained — a published version is immutable and replayed as it was,
and a form whose address lived elsewhere would change under its own submissions — and it is
also the thing a team maintaining one address across forty forms will want next.

**Renamed keys are a person's to tidy.** `country2` is correct and unlovely, and the answer
the form collects is stored under it. The property panel renames a key and carries its rules,
so tidying is one edit; nothing does it for them.

**A block can bring a language the form did not have.** Its words come in every language it
was saved with, so a German label arrives in a form that had no German catalogue, and that
catalogue then holds only the block's words. The engine falls back to the default language for
the rest, as it does for any catalogue halfway through.

**Asking where a block may go costs more than asking for a field.** The form is opened as a
second session with the block's words in it and validated once per container there, and the
real insert is validated once per container again. It runs while the place dialog is open,
not on every edit; it has not been measured on a large form.

**Nothing stores one yet.** The playground holds its blocks in memory, for the visit; neither
the admin nor the server has a place to keep them. Both are a host's to add, and the data a
builder hands out is the whole of what one needs.

**Two mistakes this caught before it shipped.** The playground's demo block was first written
with the obvious CEL, `billing.country == "CH"` — and inside a group a field nobody has
answered is absent rather than null, so the rule failed to evaluate and the canton showed for
every country. It is now compiled by the condition editor, which guards with `has()`. And the
places were first asked with the block's bare field, whose translated labels name words the
form does not have until the block brings them: every place was refused, and a block chosen
from the palette could be put nowhere. Both were found by the playground test inserting the
demo block into the starter, which no package test did, because each package's blocks had
plain-text labels.

## Alternatives considered

**A reference in the document** — a `$ref` to a block stored elsewhere. A spec change, a form
that is no longer self-contained, and a published version whose meaning depends on something
that can change after it. The copy is what immutability asks for.

**Copy the field without its rules.** The rules are most of why a block is worth saving; an
address whose canton shows for every country is not the address somebody saved.

**Rewrite a rule that reads outside the block** to read whatever the new form calls by that
name. A guess about what `region` means in somebody else's form, made silently.

**Refuse a clashing key, or a clashing word.** Refusing words was the first version. Every
block saved from a form that names its words clashes with any form using the same ids for
other words, and the refusal held for every place in it, so the palette offered a block and
then nowhere to put it. A key is renamed because the form requires unique keys; a word is
renamed for the same reason, one level down.

**A block library in the server.** Possibly, later, and a host's to choose. Deciding storage
here would decide sharing and permissions with it, which are the deployment's.
