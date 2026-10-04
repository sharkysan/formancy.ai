# Governance

formancy is currently maintained by a single maintainer, who is the final decision-maker
on technical direction, releases and roadmap. This is stated plainly rather than dressed
up as a committee: the project is young, and pretending otherwise would be misleading.

This will change as the project grows. When there are sustained external contributors,
this document will be replaced with a real governance model.

## Decisions

Architectural decisions and their reasoning are recorded in the design documents under
`docs/`. If you disagree with one, open an issue referencing it rather than a PR — the
reasoning matters more than the code.

## Contributing

The contributor agreement policy is **decided: a CLA**
([0069](docs/decisions/0069-contributions-under-a-cla.md)), because the open-core line
intends a proprietary build of code that also lives here and a DCO would close that
option at the first outside contribution. [`CONTRIBUTING.md`](CONTRIBUTING.md) says so
where somebody will read it before opening a pull request, and
[`CLA.md`](CLA.md) is the agreement itself.

**It is checked rather than only stated.** The record of who has agreed, and to which
version of the text, is [`.github/cla/signatories.json`](.github/cla/signatories.json);
`.github/workflows/cla.yml` reads the commit authors of every pull request and fails
naming any it has no signature for. There is no bot account, no token and no
third-party service — signing is a commit in this repository
([0098](docs/decisions/0098-the-cla-is-checked-in-the-repository.md)).

What that check cannot do is refuse a merge. `main` carries no branch protection rule,
so no check here is mechanically required; what stops a red one from being merged is a
maintainer reading it, which for now is one person. Said plainly because the existence
of a gate invites the opposite assumption.

The superseded position read: the policy is not yet decided, and the repository
is not open to external contributions until it is. This is deliberate: the choice cannot
be made retroactively once outside contributors exist.
