# 0152 — A merged branch is deleted

- **Status:** accepted
- **Date:** 2026-10-09
- **Deciders:** Daniel Bacher
- **Verified by:** nothing that fails, and that is said rather than papered over. The rule is a
  repository setting, `delete_branch_on_merge`, which lives in GitHub and not in the tree; a
  check of it needs the network and a token, so it would answer differently in CI than locally,
  which this repository does not count as a gate. Read on 2026-10-09 with
  `gh repo view sharkysan/formancy.ai --json deleteBranchOnMerge` → `true`, and
  `.github/REPO-METADATA.md` carries the command that sets it, as it does for the description
  and topics.

## Context

Branches were left on `origin` after their pull requests merged. On 2026-10-09 there were 41
besides `main`: 38 whose pull request had merged with that branch's last commit as its head,
one belonging to a pull request still open, and one whose pull request had been closed without
merging and whose commit is in no other branch. Locally there were 33 more, and four worktree
branches from an abandoned workflow run.

A merged branch is noise in the list a reviewer opens first, and it looks alive: a commit pushed
onto one goes nowhere, and stacked pull requests whose base had already merged stranded work three
times here. Squash merging hides them further, since a merged branch's commits are not ancestors
of `main` and `git branch --merged` does not find them.

## Decision

**A branch is deleted when its pull request merges.** On `origin` by the repository setting,
for every merge, whoever merges; locally by whoever made it. Before deleting one by hand, its
pull request must be merged with the branch's tip as the merged head — so a branch with commits
added after the merge, or a pull request closed unmerged, is kept and asked about rather than
deleted.

## Consequences

**The branch list is the open work**, and a push to a merged branch recreates a branch nobody
reviews instead of silently landing on one that looks alive — it is visible as a stray.

**A merged branch's history is gone from `origin`** except as the squashed commit on `main` and
the pull request's own record of its commits. Restoring one is a button on the pull request.

**The setting is outside the tree**, so a change to it shows up nowhere in review; the metadata
file is the only reviewable statement of it.

## Alternatives considered

**Delete by hand, after each merge.** What happened before the setting, and why 38 piled up.

**A scheduled workflow that deletes merged branches.** A second mechanism for what one setting
does, with a token that can delete branches.
