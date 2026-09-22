import { ChangeDetectionStrategy, Component, computed, forwardRef, input } from '@angular/core'
import { parseRichText } from '@formancy/spec'
import type { RichBlock, RichInline } from '@formancy/spec'

/**
 * One run of inline nodes, recursing through its own selector.
 *
 * Angular has no fragment component, so emphasis inside emphasis is expressed
 * by the component referring to itself — which is why it is its own
 * declaration rather than part of the block template below.
 */
@Component({
  selector: 'formancy-rich-inline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Itself, through forwardRef. A standalone component that uses its own
  // selector has to import itself or the nested tag is an unknown element:
  // Angular renders it as an empty custom element and says nothing, so a link
  // comes out as an anchor with no text in it rather than as an error.
  imports: [forwardRef(() => FormancyRichInline)],
  template: `
    @for (node of nodes(); track $index) {
      @switch (node.kind) {
        @case ('text') {
          <!-- Interpolated. This is the line that makes the whole design safe,
               so it is the one worth pointing at. -->
          {{ asText(node) }}
        }
        @case ('strong') {
          <strong><formancy-rich-inline [nodes]="childrenOf(node)" /></strong>
        }
        @case ('emphasis') {
          <em><formancy-rich-inline [nodes]="childrenOf(node)" /></em>
        }
        @case ('link') {
          <!-- rel, because the destination was written by whoever filled the
               form in and the page showing it is usually an administrator's.
               The parser has already refused anything but http, https and
               mailto. -->
          <a [href]="hrefOf(node)" rel="noreferrer noopener nofollow ugc">
            <formancy-rich-inline [nodes]="childrenOf(node)" />
          </a>
        }
      }
    }
  `,
})
export class FormancyRichInline {
  readonly nodes = input.required<readonly RichInline[]>()

  protected asText(node: RichInline): string {
    return node.kind === 'text' ? node.text : ''
  }

  protected childrenOf(node: RichInline): readonly RichInline[] {
    return node.kind === 'text' ? [] : node.children
  }

  protected hrefOf(node: RichInline): string {
    return node.kind === 'link' ? node.href : ''
  }
}

/**
 * Showing a `richtext` answer, from the same parser the React renderer uses.
 *
 * No `[innerHTML]`, and no `DomSanitizer` — there is nothing to sanitise. The
 * stored answer is parsed into a typed tree in `@formancy/spec`, and every
 * element here is created by Angular from that tree, so the characters
 * somebody typed arrive as interpolated text and cannot become markup however
 * they are spelled ([0052](../../../docs/decisions/0052-richtext-is-not-html.md)).
 *
 * Both renderers building the same tree into the same elements is the promise
 * the engine makes across browser and server, applied to presentation: two
 * implementations, one meaning.
 */
@Component({
  selector: 'formancy-rich-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyRichInline],
  template: `
    @if (blocks().length > 0) {
      <div data-formancy-part="richtext">
        @for (block of blocks(); track $index) {
          @if (block.kind === 'paragraph') {
            <p><formancy-rich-inline [nodes]="block.children" /></p>
          } @else if (block.ordered) {
            <ol>
              @for (item of block.items; track $index) {
                <li><formancy-rich-inline [nodes]="item" /></li>
              }
            </ol>
          } @else {
            <ul>
              @for (item of block.items; track $index) {
                <li><formancy-rich-inline [nodes]="item" /></li>
              }
            </ul>
          }
        }
      </div>
    }
  `,
})
export class FormancyRichText {
  readonly source = input<string>('')

  protected readonly blocks = computed<RichBlock[]>(() => parseRichText(this.source()))
}
