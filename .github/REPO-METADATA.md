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

Website field, once the docs site is deployed: the Starlight build in `apps/docs`.
