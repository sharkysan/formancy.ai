# Repository metadata

Kept here because GitHub's description and topics live in repo settings, not in
the tree — this file is the reviewable source for what should be set there.

## Description

> Headless form engine, renderers and self-hostable backend for React and
> Angular. One validation engine runs in the browser and on the server, so
> client and server rules cannot drift.

## Topics

GitHub allows twenty. Ordered by how likely someone is to search it:

```
forms
form-builder
dynamic-forms
form-validation
conditional-logic
json-schema
react
angular
typescript
headless
accessibility
a11y
wcag
self-hosted
fastify
postgres
cel
open-source
monorepo
form-engine
```

## Apply

```bash
gh repo edit sharkysan/formancy.ai \
  --description "Headless form engine, renderers and self-hostable backend for React and Angular. One validation engine runs in the browser and on the server, so client and server rules cannot drift." \
  --add-topic forms --add-topic form-builder --add-topic dynamic-forms \
  --add-topic form-validation --add-topic conditional-logic --add-topic json-schema \
  --add-topic react --add-topic angular --add-topic typescript --add-topic headless \
  --add-topic accessibility --add-topic a11y --add-topic wcag --add-topic self-hosted \
  --add-topic fastify --add-topic postgres --add-topic cel --add-topic open-source \
  --add-topic monorepo --add-topic form-engine
```

## Website

`https://formancy.ai`, in the repository's *About* panel. The README links it
too, but the About field is what GitHub shows beside the description and in
search results.

```bash
gh repo edit sharkysan/formancy.ai --homepage https://formancy.ai
```

## Merged branches

Deleted when their pull request merges, by the setting rather than by hand
([0152](../docs/decisions/0152-a-merged-branch-is-deleted.md)).

```bash
gh repo edit sharkysan/formancy.ai --delete-branch-on-merge
```

## The `npm` environment

`NPM_TOKEN` is a secret of the environment `npm`, not of the repository
([0176](../docs/decisions/0176-the-npm-token-is-a-secret-of-the-npm-environment.md)).
The environment admits only `v*` tags, so the release job, which runs on a
tag, gets the token, and a workflow on any other branch or tag that names the
environment is refused before it starts.

```bash
# The environment, with a deployment policy of its own rather than "any branch"
gh api -X PUT repos/sharkysan/formancy.ai/environments/npm \
  -F 'deployment_branch_policy[protected_branches]=false' \
  -F 'deployment_branch_policy[custom_branch_policies]=true'
# Only v* tags may deploy to it
gh api -X POST repos/sharkysan/formancy.ai/environments/npm/deployment-branch-policies \
  -f name='v*' -f type=tag
# The token, as a secret of the environment (prompts for the value)
gh secret set NPM_TOKEN --env npm --repo sharkysan/formancy.ai
# And then not of the repository
gh secret delete NPM_TOKEN --repo sharkysan/formancy.ai
```

The order matters: set the environment's secret before deleting the
repository's, and both only once the release job names the environment, or the
next tag's release finds no token.
