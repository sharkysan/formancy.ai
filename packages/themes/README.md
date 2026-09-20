<!-- Part of formancy: https://github.com/sharkysan/formancy.ai -->

# @formancy/themes

Two reference themes. CSS only — no JavaScript, no build step, no dependency on
any renderer.

## What they are for

The renderers ship **zero CSS**. That claim is easy to make and hard to trust,
so these two files exist to test it: the same markup and the same engine,
dressed as two products that do not look related.

| | Blueprint | Dusk |
| --- | --- | --- |
| Ground | white, workbench grey | dark |
| Corners | 3px | 10px, pill buttons |
| Type | IBM Plex Sans | Space Grotesk |
| Invalid shown as | a bar on the leading edge | a ring around the control |
| Required shown as | an asterisk | the word "required" |
| Active wizard step | underlined word | a lit dot on a track |

If supporting either file had required changing a component, the headless claim
would be false. Neither did.

## Use

```ts
import '@formancy/themes/blueprint.css'
import '@formancy/themes/dusk.css'
```

```html
<div data-formancy-theme="blueprint">…your form…</div>
```

Both files are scoped under `[data-formancy-theme]`, so a page can load both
and switch by changing one attribute — which is what the playground does.

Fonts are referenced, not bundled; the demo apps load them from Google Fonts
and both themes fall back to a system stack.

## Writing your own

Copy one and change it. The whole surface is these attributes:

`field` (with `data-state="invalid|valid"`), `label`, `error`, `radio-option`,
`repeater`, `repeater-legend`, `row`, `stepper`, `wizard-nav`, `submit`,
`error-summary`, `error-summary-heading`.

Controls are plain `input`, `select` and `textarea` inside `[data-formancy-part="field"]`.
Nothing is a class, so nothing collides with your design system.
