import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core'
import {
  codeAnswers,
  describeLayoutTarget,
  insertLayoutAndSay,
  layoutAdditions,
  layoutNodeFor,
  nameOfAddition,
  nextSpecVersion,
  upgradeAndSay,
} from '@formancy/builder-core'
import type { LayoutAddition } from '@formancy/builder-core'
import type { BuilderSession, LayoutLocation, LayoutNode } from './types.js'
import { BuilderTextPipe } from './text.pipe.js'
import { injectBuilderView } from './view.js'

interface Target {
  location: LayoutLocation
  label: string
}

/**
 * Adding something to an arrangement: what, which answer a code shows, and where.
 *
 * Its own component because it is its own conversation — three dialogs with a
 * state of their own that nothing else in the pane reads — and because the pane
 * grew past the size budget the day it learned to offer what the React pane
 * offers. What is offered, what each new node looks like and what is said
 * afterwards are builder-core's, so this and the React pane cannot offer
 * different things for one document
 * ([0116](../../../docs/decisions/0116-what-a-builder-says-is-decided-once.md)).
 *
 * The node is built the moment it is chosen, so "where should it go" is asked
 * about the node that will actually be inserted.
 */
@Component({
  selector: 'formancy-layout-add',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BuilderTextPipe],
  template: `
    @if (step() === 'what') {
      <div
        role="dialog"
        [attr.aria-label]="'layout.addTitle' | builderText: text()"
        data-formancy-part="layout-add"
        (keydown.escape)="escape($event)"
      >
        <ul>
          <!-- A code needs an answer to encode, so it takes a step the others do
               not; in a version 1 document it is offered with the upgrade rather
               than as a dead end. -->
          @for (addition of additions(); track key(addition)) {
            <li>
              @if (addition.what === 'code' && addition.locked) {
                <span data-formancy-part="palette-locked">{{ addition.label }}</span>
                <span data-formancy-part="palette-hint">
                  {{ addition.hint }}
                  <button type="button" (click)="upgrade()">
                    {{ 'tree.upgrade' | builderText: text() : { version: nextVersion() } }}
                  </button>
                </span>
              } @else {
                <button type="button" (click)="choose(addition)">{{ addition.label }}</button>
                <span data-formancy-part="palette-hint">{{ addition.hint }}</span>
              }
            </li>
          }
        </ul>
        <button type="button" (click)="closed.emit()">
          {{ 'dialog.cancel' | builderText: text() }}
        </button>
      </div>
    }

    @if (step() === 'which-answer') {
      <div
        role="dialog"
        [attr.aria-label]="'layout.codeWhich' | builderText: text()"
        data-formancy-part="layout-add-which"
        (keydown.escape)="escape($event)"
      >
        <ul>
          @for (answer of answers(); track answer.path) {
            <li>
              <button type="button" (click)="chooseCode(answer.path)">{{ answer.label }}</button>
            </li>
          }
        </ul>
        <button type="button" (click)="closed.emit()">
          {{ 'dialog.cancel' | builderText: text() }}
        </button>
      </div>
    }

    @if (node() !== null) {
      <div
        role="dialog"
        [attr.aria-label]="'layout.addWhere' | builderText: text() : { what: what() }"
        data-formancy-part="layout-add-where"
        (keydown.escape)="escape($event)"
      >
        <ul>
          @for (target of targets(); track targetKey(target)) {
            <li>
              <button type="button" (click)="place(target)">{{ target.label }}</button>
            </li>
          }
        </ul>
        <button type="button" (click)="closed.emit()">
          {{ 'dialog.cancel' | builderText: text() }}
        </button>
      </div>
    }
  `,
})
export class FormancyLayoutAdd {
  readonly session = input.required<BuilderSession>()
  readonly layout = input.required<string>()
  /**
   * A command ran, and this is what it said. The pane announces it. Moving the
   * document to a newer spec version says something and keeps the palette open,
   * because the code it unlocks is the next thing the person wants to choose.
   */
  readonly said = output<string>()
  /** The conversation is over: something was placed, or the person left. */
  readonly closed = output<void>()

  protected readonly view = injectBuilderView(this.session)
  protected readonly text = computed(() => this.session().text)

  /** Which question is being asked. `where` is asked about `node`. */
  protected readonly step = signal<'what' | 'which-answer' | 'where'>('what')
  protected readonly node = signal<LayoutNode | null>(null)

  protected readonly additions = computed((): LayoutAddition[] => {
    // Through the view, so the list follows the document.
    void this.view()
    return layoutAdditions(this.session(), this.layout())
  })
  protected readonly answers = computed(() => {
    void this.view()
    return codeAnswers(this.session())
  })
  protected readonly nextVersion = computed(
    () => nextSpecVersion(this.view().document.specVersion) ?? '',
  )
  protected readonly what = computed(() => {
    const node = this.node()
    return node === null ? '' : nameOfAddition(this.session(), node)
  })
  protected readonly targets = computed((): Target[] => {
    const node = this.node()
    if (node === null) return []
    return this.session()
      .validLayoutTargets(this.layout(), node)
      .map((location) => ({
        location,
        label: describeLayoutTarget(this.view().document, location, undefined, this.text()),
      }))
  })

  protected key(addition: LayoutAddition): string {
    if (addition.what === 'field') return `field:${addition.path}`
    return addition.what === 'container' ? addition.kind : 'code'
  }

  protected targetKey(target: Target): string {
    return `${target.location.parent.join('.')}:${String(target.location.index)}`
  }

  protected choose(addition: LayoutAddition): void {
    if (addition.what === 'code') {
      this.step.set('which-answer')
      return
    }
    this.ask(
      layoutNodeFor(
        this.session(),
        addition.what === 'field'
          ? { what: 'field', path: addition.path }
          : { what: 'container', kind: addition.kind },
      ),
    )
  }

  protected chooseCode(path: string): void {
    this.ask(layoutNodeFor(this.session(), { what: 'code', path }))
  }

  protected upgrade(): void {
    this.said.emit(upgradeAndSay(this.session()))
  }

  protected place(target: Target): void {
    const node = this.node()
    if (node === null) return
    this.said.emit(insertLayoutAndSay(this.session(), node, target))
    this.closed.emit()
  }

  /**
   * Escape inside a dialog closes it. On the dialog rather than the document, so
   * it cannot swallow the key from anything else on the page — the React pane's
   * shape, which this one lacked: its dialogs could only be left by Cancel.
   */
  protected escape(event: Event): void {
    event.preventDefault()
    event.stopPropagation()
    this.closed.emit()
  }

  private ask(node: LayoutNode): void {
    this.node.set(node)
    this.step.set('where')
  }
}
