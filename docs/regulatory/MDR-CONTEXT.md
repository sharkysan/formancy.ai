# formancy in a Medical Device Regulation context

> **Read this first.** It says what this documentation set is, and — more
> importantly — what it is not. Everything else in `docs/` should be read
> through it.

## The short version

**formancy is not a medical device, and this repository makes no claim of
conformity with Regulation (EU) 2017/745.**

What it is: a general-purpose form platform, developed with engineering
practices that produce the kind of evidence a manufacturer needs when they
incorporate third-party software into a regulated product. If you are building
a medical device and you are considering formancy as a component, this
documentation exists so that formancy is **software of known provenance** to
you rather than software of unknown provenance.

That distinction is the whole point of these documents, and it is worth being
precise about it.

## What a manufacturer actually needs, and which part of it is here

Under IEC 62304, software that is incorporated into a medical device but was
not developed under that standard's lifecycle is **SOUP** — Software Of Unknown
Provenance. SOUP is not disqualifying; the overwhelming majority of medical
device software contains it. What the standard requires is that the
manufacturer *characterise* it:

| IEC 62304 asks the manufacturer for | Where formancy provides input |
|---|---|
| §5.3.3 — functional and performance requirements of the SOUP item | [`SOUP-DECLARATION.md`](SOUP-DECLARATION.md), [`../architecture/09-quality-requirements.md`](../architecture/09-quality-requirements.md) |
| §5.3.4 — hardware and software required to support the SOUP item | [`SOUP-DECLARATION.md`](SOUP-DECLARATION.md) |
| §7.1.2 — evaluation of published anomalies | [`SOUP-DECLARATION.md`](SOUP-DECLARATION.md), the public issue tracker, `MIGRATIONS.md` |
| §5.1.1 / §5.1.4 — the supplier's development plan and design rationale | [`LIFECYCLE.md`](LIFECYCLE.md), [`../decisions/`](../decisions/) |
| §5.5 / §5.6 — verification evidence | [`../architecture/10-verification.md`](../architecture/10-verification.md) |
| §7.1 — analysis of contributing software causes | [`SAFETY-ANALYSIS.md`](SAFETY-ANALYSIS.md) |

Under MDR Annex II, the technical documentation must contain design and
manufacturing information (§3) and evidence against the General Safety and
Performance Requirements of Annex I — of which **Annex I §17**, on electronic
programmable systems, is the one this material speaks to: software developed
according to the state of the art, taking into account the development
lifecycle, risk management, verification and validation.

The architecture documents and the decision records are contemporaneous
evidence of exactly that: what was decided, when, why, what was rejected, and
what holds each decision in place.

## What is deliberately not here, and cannot be

A library cannot supply these, and a manufacturer should be suspicious of any
supplier who claims to:

**An intended purpose.** MDR conformity is assessed against a stated intended
purpose in a clinical context. formancy has no clinical intended purpose. The
manufacturer defines the intended purpose of the device and formancy's role
within it.

**A risk management file per ISO 14971.** Risk is a property of the device in
its use context, not of a component in isolation. [`SAFETY-ANALYSIS.md`](SAFETY-ANALYSIS.md)
enumerates what this software can do wrong and what constrains it; it does not
and cannot assign severity, probability or acceptability, because those depend
entirely on what the device does with a form. It is an **input** to the
manufacturer's risk analysis, not a substitute for it.

**A usability engineering file per IEC 62366-1.** The accessibility and
interaction decisions recorded here ([0021](../decisions/0021-engine-owns-aria.md),
[0034](../decisions/0034-accessible-name-only.md)) are real and verified, but
formative and summative usability evaluation happens against the manufacturer's
user interface, with the manufacturer's users, for the manufacturer's tasks.

**A quality management system per ISO 13485.** The project does not operate a
certified QMS. [`LIFECYCLE.md`](LIFECYCLE.md) describes the development process
honestly and in enough detail to be assessed; it describes what is actually
done, not what a certificate would assert.

**Clinical evaluation, post-market surveillance, or a declaration of
conformity.** These are the manufacturer's obligations and belong to the device.

**A software safety classification.** IEC 62304 Class A, B or C is assigned by
the manufacturer based on the harm that a failure of *this software in this
device* could cause. The same library can be Class A in one device and Class C
in another.

## How to use this set if you are a manufacturer

1. Read [`SOUP-DECLARATION.md`](SOUP-DECLARATION.md) and decide whether the
   characterisation is sufficient for your classification. For Class C you will
   almost certainly need more, and should contact the maintainers rather than
   assume.
2. Read [`SAFETY-ANALYSIS.md`](SAFETY-ANALYSIS.md) and map each failure mode
   onto harms in *your* use context. Several of them are benign in a marketing
   form and are not benign in a clinical intake form — the analysis says which,
   but only you can say what the harm is.
3. Pin an exact version. Everything in this set describes a specific commit;
   a range is not characterised software.
4. Treat [`../decisions/`](../decisions/) as design rationale you may reference
   but did not author. Decisions marked "Not mechanically enforced" are the
   ones where your own verification has to do the work.
5. Note that spec version 0 is explicitly unstable
   ([0009](../decisions/0009-independent-spec-version.md)). Building a
   regulated product on an unstable data format is a decision to take
   deliberately, with a written rationale, or to defer until the spec freezes
   to version 1.

## Honesty about what this documentation is

These documents were written **after** the software, from the real history —
commits, review findings, and the arguments that changed direction. They are
contemporaneous in the sense that the work is days old and the reasoning is
first-hand, not reconstructed years later from the code. They are not
contemporaneous in the sense that IEC 62304 §5.1 means, where a software
development plan exists before the software does.

Where a decision record says a decision is enforced by a test, that test exists
and was run. Where nothing enforces a decision, the record says so. That
property — that a reader can check every claim against the repository — is what
makes this material usable as evidence, and it is worth more than a tidier
narrative would be.
