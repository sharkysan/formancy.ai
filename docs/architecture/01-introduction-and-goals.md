# 1. Introduction and goals

## What formancy is

A form platform: a versioned schema, an engine that evaluates it, renderers for
React and Angular, a builder, and a self-hostable backend that stores
submissions bound to the exact form version that produced them.

It exists because [form.io](https://form.io) is the category's incumbent and
its architecture is the reason for building something else. Four problems drive
the project, and all four were weighted equally:

1. **Renderer architecture and developer experience.** An imperative,
   jQuery-era core wrapped in thin per-framework shells. The wrappers are not
   idiomatic, TypeScript support is weak, and nothing composes with modern
   framework reactivity or with the application's own form state.
2. **Theming and design-system fit.** Bootstrap markup baked in. Matching an
   in-house design system means fighting CSS and overriding templates.
3. **Licensing, cost and lock-in.** The embeddable builder, accessibility and
   premium components sit behind closed modules and negotiated pricing.
4. **Performance, bundle size and accessibility.** A large monolithic bundle,
   sluggish behaviour on deeply conditional forms, and accessibility offered as
   an add-on rather than being correct by default.

## Quality goals, in priority order

These are ordered, and the order has been used to settle real arguments.

| # | Goal | What it means concretely |
|---|---|---|
| 1 | **Client and server cannot disagree** | The same compiled engine decides validity in the browser and on the server, and a replay is byte-identical |
| 2 | **Data survives the form changing** | A submission is joined to the exact immutable schema that produced it, forever |
| 3 | **The application owns its markup** | Renderers emit no styling; every id and ARIA attribute comes from the engine |
| 4 | **Accessible by construction, not by audit** | A renderer whose markup is not navigable by role and accessible name fails the test suite |
| 5 | **Fast on large conditional forms** | Measured budgets in CI, not claims |
| 6 | **Nothing essential is withheld** | Apache-2.0; the sold features are about operating the platform, not using it |

Goal 1 is load-bearing: a design that compromises it should be rejected even
when it is otherwise better. Goal 2 is the one that cannot be retrofitted once
users have production data.

## Scope

**In v1.** The engine, both renderers, the builder, the self-hostable backend
with submissions, storage, server-side revalidation, webhooks and form
versioning, deployable with Docker.

**Explicitly out of v1.** Multi-tenancy, PDF generation, e-signatures,
analytics, a hosted developer portal.

**Out of v0.1 specifically**, with the type name and value shape reserved so
adding each is a compatible change rather than a breaking one: file upload,
remote and cascading option sources, async validators, date-time and timezone
handling, currency and masking, multi-select and combobox, rich text,
signature, address, rating, slider, tabs and accordions, and conditional page
routing.

## Stakeholders

| Stakeholder | What they need from the architecture |
|---|---|
| Application developer | Idiomatic bindings, their own markup, types that are right |
| Form author (non-technical) | Errors at authoring time, not at fill-in time |
| Person filling in a form | A form that is navigable, that does not lose their answers, and that does not reject them for reasons it will not explain |
| Self-hoster | One container, one database, no hidden dependencies, no paywall |
| Auditor | A submission that can be read against the schema that produced it, years later |
| Contributor | To understand the repository in ten minutes |
