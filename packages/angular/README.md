<!-- Part of formancy: https://github.com/sharkysan/formancy.ai -->

# @formancy/angular

The Angular binding for formancy: signals over the engine's snapshot protocol,
standalone components, and no `zone.js`.

Requires Angular 22. Built with ng-packagr to the Angular Package Format.

## The load-bearing decision

`injectField` creates one signal per field and writes to it exactly when the
engine says that field changed. There is no `zone.js`, no `ChangeDetectorRef`
and no whole-form re-render: identity-stable snapshots mean an `OnPush`
component sees a real reference change precisely when something it shows is
different. An engine mutation from outside Angular — a server prefill, devtools
— reaches the DOM through the same path.

The second is that this is not a translation of the React renderer but the same
engine bound idiomatically. Where Angular demands a different shape — a DI
registry instead of props, an injection token for the field context — the shape
differs and the *observable behaviour* does not. The shared conformance suite is
what proves that rather than the claim.

## Use

```ts
bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection(), provideFormancy(engine)],
})
```

```ts
@Component({ imports: [FormancyForm], template: `<formancy-form />` })
export class AppComponent {}
```

Or bind a field yourself:

```ts
readonly field = injectField('email')
// field.snapshot() — value, errors, ids, ARIA props
// field.setValue(v), field.touch()
```

Also exported: `injectRepeater`, `injectWizard`, `injectSubmit`,
`FORMANCY_REGISTRY` for replacing field components, and an `ErrorSummary` with
the focus semantics WCAG expects.

Docs: `apps/docs` (Quickstart: Angular).
