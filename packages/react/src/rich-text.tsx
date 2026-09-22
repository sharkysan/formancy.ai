import { Fragment } from 'react'
import type { ReactElement } from 'react'
import { parseRichText } from '@formancy/spec'
import type { RichBlock, RichInline } from '@formancy/spec'

/**
 * Showing a `richtext` answer.
 *
 * Every element here is created by React from a typed tree. The stored answer
 * never reaches `dangerouslySetInnerHTML`, and there is no sanitiser, because
 * there is nothing to sanitise: the parser in `@formancy/spec` has already
 * turned the characters somebody typed into `{ kind: 'text' }` nodes, and a
 * text node cannot be an element however it is spelled.
 *
 * That is the whole reason the grammar exists rather than storing HTML. A form
 * answer is written by anyone who can reach the form and read later by an
 * administrator, which is the exact shape of a stored cross-site scripting
 * bug ([0052](../../../docs/decisions/0052-richtext-is-not-html.md)).
 *
 * The Angular renderer builds the same tree into the same elements, from the
 * same parser, so the two cannot disagree about what an answer says.
 */
export function RichText({ source }: { source: string }): ReactElement | null {
  const blocks = parseRichText(source)
  if (blocks.length === 0) return null

  return (
    <div data-formancy-part="richtext">
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  )
}

function Block({ block }: { block: RichBlock }): ReactElement {
  if (block.kind === 'paragraph') {
    return (
      <p>
        <Inlines nodes={block.children} />
      </p>
    )
  }

  const items = block.items.map((item, index) => (
    <li key={index}>
      <Inlines nodes={item} />
    </li>
  ))

  return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>
}

function Inlines({ nodes }: { nodes: readonly RichInline[] }): ReactElement {
  return (
    <>
      {nodes.map((node, index) => (
        <Fragment key={index}>
          <Inline node={node} />
        </Fragment>
      ))}
    </>
  )
}

function Inline({ node }: { node: RichInline }): ReactElement {
  switch (node.kind) {
    case 'text':
      return <>{node.text}</>
    case 'strong':
      return (
        <strong>
          <Inlines nodes={node.children} />
        </strong>
      )
    case 'emphasis':
      return (
        <em>
          <Inlines nodes={node.children} />
        </em>
      )
    case 'link':
      // `rel` because the destination was written by whoever filled the form
      // in, and the page showing it is usually an administrator's. The parser
      // has already refused anything but http, https and mailto.
      return (
        <a href={node.href} rel="noreferrer noopener nofollow ugc">
          <Inlines nodes={node.children} />
        </a>
      )
  }
}
